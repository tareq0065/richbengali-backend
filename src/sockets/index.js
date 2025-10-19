import { Server } from "socket.io";
import { Message, Notification } from "../models/index.js";
import { devLog } from "../utils/devlog.js";

export function setupSockets(httpServer, app) {
  const io = new Server(httpServer, { cors: { origin: "*" } });
  app.set("io", io);

  // Track all sockets per user
  const userSockets = new Map(); // userId -> Set<socketId>
  // Track active chats per user across all sockets
  const activeByUser = new Map(); // userId -> Set<partnerId>
  // Track which chats this specific socket has marked active
  const activeBySocket = new Map(); // socketId -> Set<partnerId>

  app.set("userSockets", userSockets);
  app.set("activeByUser", activeByUser);

  function addSocket(userId, socketId) {
    let set = userSockets.get(userId);
    if (!set) {
      set = new Set();
      userSockets.set(userId, set);
    }
    set.add(socketId);
  }
  function removeSocket(userId, socketId) {
    const set = userSockets.get(userId);
    if (!set) return;
    set.delete(socketId);
    if (set.size === 0) userSockets.delete(userId);
  }

  function markActive(userId, withUserId, socketId) {
    // mark for socket
    let sset = activeBySocket.get(socketId);
    if (!sset) {
      sset = new Set();
      activeBySocket.set(socketId, sset);
    }
    sset.add(withUserId);

    // mark for user (union of all sockets)
    let uset = activeByUser.get(userId);
    if (!uset) {
      uset = new Set();
      activeByUser.set(userId, uset);
    }
    uset.add(withUserId);
  }

  function markInactive(userId, withUserId, socketId) {
    // remove from this socket’s active set
    const sset = activeBySocket.get(socketId);
    if (sset) {
      sset.delete(withUserId);
      if (sset.size === 0) activeBySocket.delete(socketId);
    }

    // recompute user-level active set from remaining sockets
    const sockets = userSockets.get(userId);
    const aggregate = new Set();
    if (sockets && sockets.size) {
      for (const sid of sockets) {
        const aset = activeBySocket.get(sid);
        if (aset) for (const v of aset) aggregate.add(v);
      }
    }
    if (aggregate.size) {
      activeByUser.set(userId, aggregate);
    } else {
      activeByUser.delete(userId);
    }
  }

  io.on("connection", (socket) => {
    const userId = String(socket.handshake.auth?.userId || "");
    if (!userId) {
      socket.disconnect(true);
      return;
    }
    devLog("socket connected", { userId, sid: socket.id });

    // join personal room for notifications
    socket.join(userId);
    addSocket(userId, socket.id);

    socket.on("chat:join", (payload) => {
      const otherUserId = payload && payload.otherUserId ? String(payload.otherUserId) : null;
      if (!otherUserId) return;
      const room = [userId, otherUserId].sort().join(":");
      socket.join(room);
    });

    socket.on("chat:active", (payload) => {
      const withUserId = payload && payload.withUserId ? String(payload.withUserId) : null;
      if (!withUserId) return;
      markActive(userId, withUserId, socket.id);
      devLog("chat:active", { userId, withUserId, sid: socket.id });
    });

    socket.on("chat:inactive", (payload) => {
      // payload may be undefined if client sent no args
      let withUserId = payload && payload.withUserId ? String(payload.withUserId) : null;

      if (withUserId) {
        // clear only this pair for this socket
        markInactive(userId, withUserId, socket.id);
        devLog("chat:inactive(one)", { userId, withUserId, sid: socket.id });
      } else {
        // no id provided -> clear ALL actives for this socket
        const sset = activeBySocket.get(socket.id);
        if (sset && sset.size) {
          for (const partnerId of Array.from(sset)) {
            markInactive(userId, partnerId, socket.id);
          }
          activeBySocket.delete(socket.id);
        }
        devLog("chat:inactive(all)", { userId, sid: socket.id });
      }
    });

    socket.on("disconnect", () => {
      // On disconnect, drop all actives for this socket
      const sset = activeBySocket.get(socket.id);
      if (sset) {
        for (const partnerId of sset) {
          markInactive(userId, partnerId, socket.id);
        }
        activeBySocket.delete(socket.id);
      }
      removeSocket(userId, socket.id);
      devLog("socket disconnected", { userId, sid: socket.id });
    });

    // Immediate send via socket
    socket.on("chat:message", async ({ to, content, clientId }) => {
      to = String(to);
      const room = [userId, to].sort().join(":");

      const msg = await Message.create({
        room_id: room,
        sender_id: userId,
        receiver_id: to,
        content: String(content ?? "").trim(),
      });

      // Normalize + include clientId for optimistic reconciliation
      const wire = {
        id: String(msg.id),
        sender_id: String(msg.sender_id),
        receiver_id: String(msg.receiver_id),
        content: msg.content,
        created_at: msg.created_at,
        clientId, // <- pass-through
      };

      io.to(room).emit("chat:message", wire);

      // notifications (unchanged)
      const toActives = activeByUser.get(to);
      const isActive = !!toActives && toActives.has(String(userId));
      if (!isActive) {
        await Notification.create({
          user_id: to,
          type: "message",
          actor_id: userId,
          payload: { room_id: room },
        });
        io.to(to).emit("notification:new", { type: "message", payload: wire });
      }
    });

    socket.on("chat:history", async ({ withUserId }, ack) => {
      const other = String(withUserId || "");
      if (!other || typeof ack !== "function") return;

      const room = [userId, other].sort().join(":");
      const rows = await Message.findAll({
        where: { room_id: room },
        order: [["created_at", "ASC"]],
      });

      const wire = rows.map((m) => ({
        id: String(m.id),
        sender_id: String(m.sender_id),
        receiver_id: String(m.receiver_id),
        content: m.content,
        created_at: m.created_at,
      }));

      ack(wire);
    });
  });

  return io;
}
