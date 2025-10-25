import express from "express";
import cors from "cors";
import helmet from "helmet";
import { errorHandler } from "./middleware/error.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import relRoutes from "./routes/relations.js";
import visitsRouter from "./routes/visits.js";
import msgRoutes from "./routes/messages.js";
import uploadRoutes from "./routes/uploads.js";
import notifRoutes from "./routes/notifications.js";
import stripeRoutes from "./routes/stripe.js";
import creditsRoutes from "./routes/credits.js";
import boostRoutes from "./routes/boost.js";
import subscriptionRoutes from "./routes/subscription.js";
import refsRouter from "./routes/refs.js";
import otpRouter from "./routes/otp.js";
import chimeRouter from "./routes/chime.js";

const app = express();

app.use((req, res, next) => {
  if (req.originalUrl === "/stripe/webhook") return next();
  return express.json()(req, res, next);
});

app.use(cors());
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/auth", otpRouter);
app.use("/users", userRoutes);
app.use("/relations", relRoutes);
app.use("/visits", visitsRouter);
app.use("/messages", msgRoutes);
app.use("/uploads", uploadRoutes);
app.use("/notifications", notifRoutes);
app.use("/credits", creditsRoutes);
app.use("/boost", boostRoutes);
// Stripe webhook first with raw body
app.use("/stripe", stripeRoutes);
app.use("/subscription", subscriptionRoutes);
app.use("/refs", refsRouter);
app.use("/chime", chimeRouter);

app.use(errorHandler);

export default app;
