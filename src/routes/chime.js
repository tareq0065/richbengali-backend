import express from "express";
import {
  ChimeSDKMeetingsClient,
  CreateMeetingCommand,
  CreateAttendeeCommand,
  GetMeetingCommand,
} from "@aws-sdk/client-chime-sdk-meetings";
import { randomUUID } from "crypto";

export const router = express.Router();

/* =========================================================
   In-memory stores
========================================================= */
const sseClients = new Map();
const roomToMeetingId = new Map();
const ensureInFlight = new Map();

/* =========================================================
   AWS Chime SDK Client
========================================================= */
const client = new ChimeSDKMeetingsClient({
  region: process.env.AWS_REGION || "us-east-1",
});

/* =========================================================
   Utility helpers
========================================================= */
function safeExternalId(room) {
  const cleaned = String(room)
    .replace(/[^A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=\-]/g, "-")
    .slice(0, 64);
  return cleaned.length >= 2 ? cleaned : `room-${Date.now()}`;
}

function normalizeId(id) {
  return String(id || "")
    .trim()
    .toLowerCase();
}

function roomFor(a, b) {
  return [a, b].map(normalizeId).sort().join("__");
}

/* =========================================================
   Meeting management
========================================================= */
async function createNewMeeting(room) {
  const region = process.env.AWS_REGION || "us-east-1";

  const cmd = new CreateMeetingCommand({
    ClientRequestToken: randomUUID(),
    MediaRegion: region,
    ExternalMeetingId: safeExternalId(room),
  });

  const out = await client.send(cmd);
  const meetingId = out && out.Meeting && out.Meeting.MeetingId;
  if (!meetingId) throw new Error("create_meeting_missing_id");

  roomToMeetingId.set(room, meetingId);
  return meetingId;
}

async function verifyMeetingExists(meetingId) {
  try {
    await client.send(new GetMeetingCommand({ MeetingId: meetingId }));
    return true;
  } catch (e) {
    if (e && (e.name === "NotFoundException" || /not found/i.test(String(e.message)))) {
      return false;
    }
    throw e;
  }
}

async function ensureMeeting(room) {
  const inflight = ensureInFlight.get(room);
  if (inflight) return inflight;

  const p = (async () => {
    const cached = roomToMeetingId.get(room);
    if (cached) {
      const ok = await verifyMeetingExists(cached);
      if (ok) return cached;
      roomToMeetingId.delete(room);
    }
    return await createNewMeeting(room);
  })().finally(() => {
    ensureInFlight.delete(room);
  });

  ensureInFlight.set(room, p);
  return p;
}

/* =========================================================
   SSE events
========================================================= */
router.get("/events", (req, res) => {
  const userId = normalizeId(req.query.userId);
  if (!userId) return res.status(400).json({ message: "missing_userId" });

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // flushHeaders() is Node's way of sending headers immediately in some frameworks;
  // express' res.flushHeaders may or may not exist depending on your setup.
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  sseClients.set(userId, res);
  console.log("[SSE] connected:", userId);

  const keepAlive = setInterval(() => {
    try {
      res.write(`: ping\n\n`);
    } catch (err) {
      // ignore write failure here
    }
  }, 20000);

  req.on("close", () => {
    clearInterval(keepAlive);
    sseClients.delete(userId);
    try {
      res.end();
    } catch (err) {}
    console.log("[SSE] closed:", userId);
  });

  // initial event so client knows it's live
  res.write(`data: ${JSON.stringify({ type: "connected", userId })}\n\n`);
});

/* =========================================================
   Start Call
========================================================= */
router.post("/calls/start", async (req, res) => {
  try {
    const fromUserId = normalizeId(req.body.fromUserId);
    const toUserId = normalizeId(req.body.toUserId);

    const fromRaw = req.body.from || {};
    const from = {
      id: fromRaw.id != null ? fromRaw.id : fromUserId,
      name: fromRaw.name,
      username: fromRaw.username,
      avatarUrl: fromRaw.avatarUrl,
      location: fromRaw.location,
    };

    if (!fromUserId || !toUserId) {
      return res.status(400).json({ message: "missing_ids" });
    }

    const room = roomFor(fromUserId, toUserId);
    const meetingId = await ensureMeeting(room);

    const attendee = await client.send(
      new CreateAttendeeCommand({
        MeetingId: meetingId,
        ExternalUserId: fromUserId.slice(0, 64),
      }),
    );

    const meeting = await client.send(new GetMeetingCommand({ MeetingId: meetingId }));

    // notify callee (SSE push)
    const callee = sseClients.get(toUserId);
    if (callee) {
      console.log("[CALL] sending incoming_call to", toUserId);
      callee.write(
        `data: ${JSON.stringify({
          type: "incoming_call",
          room,
          fromUserId,
          from,
          timestamp: Date.now(),
        })}\n\n`,
      );
    } else {
      console.log("[CALL] no SSE connection for", toUserId);
      console.log("Active clients:", [...sseClients.keys()]);
    }

    return res.json({
      JoinInfo: {
        Meeting: meeting.Meeting,
        Attendee: attendee.Attendee,
      },
      room,
      startTime: new Date().toISOString(),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      message: "start_failed",
      error: e && e.message,
    });
  }
});

/* =========================================================
   Accept Call
========================================================= */
router.post("/calls/accept", async (req, res) => {
  try {
    const room = String(req.body.room || "");
    const userId = normalizeId(req.body.userId);
    const otherUserId = normalizeId(req.body.otherUserId);

    if (!room || !userId || !otherUserId) {
      return res.status(400).json({ message: "missing_params" });
    }

    const meetingId = await ensureMeeting(room);

    const attendee = await client.send(
      new CreateAttendeeCommand({
        MeetingId: meetingId,
        ExternalUserId: userId.slice(0, 64),
      }),
    );

    const meeting = await client.send(new GetMeetingCommand({ MeetingId: meetingId }));

    // notify caller that callee accepted
    const caller = sseClients.get(otherUserId);
    if (caller) {
      caller.write(
        `data: ${JSON.stringify({
          type: "accepted",
          room,
          by: userId,
        })}\n\n`,
      );
    }

    return res.json({
      JoinInfo: {
        Meeting: meeting.Meeting,
        Attendee: attendee.Attendee,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      message: "accept_failed",
      error: e && e.message,
    });
  }
});

/* =========================================================
   Decline / Busy
========================================================= */
router.post("/calls/decline", async (req, res) => {
  try {
    const room = String(req.body.room || "");
    const userId = normalizeId(req.body.userId);
    const otherUserId = normalizeId(req.body.otherUserId);
    const by = req.body.by || { id: userId };

    if (!room || !userId || !otherUserId) {
      return res.status(400).json({ message: "missing_params" });
    }

    const other = sseClients.get(otherUserId);
    if (other) {
      other.write(
        `data: ${JSON.stringify({
          type: "busy",
          room,
          by,
          byUserId: userId,
        })}\n\n`,
      );
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      message: "decline_failed",
      error: e && e.message,
    });
  }
});

/* =========================================================
   End Call
========================================================= */
router.post("/calls/end", async (req, res) => {
  try {
    const room = String(req.body.room || "");
    const userId = normalizeId(req.body.userId);
    const otherUserId = normalizeId(req.body.otherUserId);

    if (!room || !userId || !otherUserId) {
      return res.status(400).json({ message: "missing_params" });
    }

    const other = sseClients.get(otherUserId);
    if (other) {
      other.write(
        `data: ${JSON.stringify({
          type: "end_call",
          room,
          byUserId: userId,
        })}\n\n`,
      );
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      message: "end_failed",
      error: e && e.message,
    });
  }
});

/* =========================================================
   Fallback Join
========================================================= */
router.post("/meetings/:room/join", async (req, res) => {
  try {
    const room = req.params.room;
    const userId = normalizeId(req.body.userId);

    const meetingId = await ensureMeeting(room);

    const attendee = await client.send(
      new CreateAttendeeCommand({
        MeetingId: meetingId,
        ExternalUserId: userId.slice(0, 64),
      }),
    );

    const meeting = await client.send(new GetMeetingCommand({ MeetingId: meetingId }));

    res.json({
      JoinInfo: {
        Meeting: meeting.Meeting,
        Attendee: attendee.Attendee,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      message: "join_failed",
      error: e && e.message,
    });
  }
});

export default router;
