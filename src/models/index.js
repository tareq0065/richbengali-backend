import { DataTypes, Op } from "sequelize";
import { sequelize } from "../config/sequelize.js";

export { Op };

/* ------------------------------- Core Models ------------------------------- */

export const User = sequelize.define(
  "User",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    email: { type: DataTypes.STRING, unique: true, allowNull: true },
    password_hash: { type: DataTypes.STRING, allowNull: true },
    phone: { type: DataTypes.STRING, unique: true, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    age: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 18 } },
    gender: {
      type: DataTypes.ENUM("male", "female", "other"),
      allowNull: false,
      defaultValue: "other",
    },
    city: { type: DataTypes.STRING },
    profile_picture_url: { type: DataTypes.STRING },
    fcm_token: { type: DataTypes.STRING },
    is_premium: { type: DataTypes.BOOLEAN, defaultValue: false },
    // New fields for time-limited perks and badge
    premium_until: { type: DataTypes.DATE, allowNull: true },
    unlimited_superlikes_until: { type: DataTypes.DATE, allowNull: true },
    has_premium_badge: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    tableName: "users",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false,
  },
);

export const OtpCode = sequelize.define(
  "OtpCode",
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    target: { type: DataTypes.STRING, allowNull: false }, // email or E.164 phone
    channel: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { isIn: [["email", "phone"]] },
    },
    purpose: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { isIn: [["register", "login", "reset"]] },
    },
    code_hash: { type: DataTypes.STRING, allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    used_at: { type: DataTypes.DATE, allowNull: true },
    meta: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    tableName: "otp_codes",
    timestamps: true,
    underscored: true, // use snake_case columns
    createdAt: "created_at", // map explicitly to match migration
    updatedAt: "updated_at",
    indexes: [
      { fields: ["target"] },
      { fields: ["purpose"] },
      { fields: ["expires_at"] },
      { fields: ["used_at"] },
      { fields: ["target", "channel", "purpose", "used_at", "expires_at", "created_at"] },
    ],
  },
);

export const PasswordReset = sequelize.define(
  "PasswordReset",
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    token_hash: { type: DataTypes.TEXT, allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    used_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "password_resets",
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
);

/* ---------------------------- Relations / Social --------------------------- */

const KINDS = ["like", "favorite", "visit", "superlike"];
export const UserRelation = sequelize.define(
  "UserRelation",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    kind: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { isIn: [KINDS] },
    },
  },
  {
    tableName: "user_relations",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false,
    // NOTE: original index kept as-is to match your existing schema
    indexes: [{ unique: true, fields: ["actor_id", "target_id", "kind", "superlike"] }],
  },
);

export const Message = sequelize.define(
  "Message",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    room_id: { type: DataTypes.STRING, allowNull: false },
    content: { type: DataTypes.TEXT },
  },
  {
    tableName: "messages",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false,
  },
);

export const Notification = sequelize.define(
  "Notification",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    type: {
      type: DataTypes.ENUM("like", "favorite", "message", "superlike", "visit"),
      allowNull: false,
    },
    payload: { type: DataTypes.JSONB, allowNull: true },
    is_read: { type: DataTypes.BOOLEAN, defaultValue: false },
    read_at: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "notifications",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false,
  },
);

/* ----------------------------- Billing / Plans ----------------------------- */

export const Subscription = sequelize.define(
  "Subscription",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    stripe_customer_id: DataTypes.STRING,
    stripe_subscription_id: { type: DataTypes.STRING, unique: true },
    status: DataTypes.STRING,
    current_period_end: DataTypes.DATE,
    // New fields to map Stripe price/plan locally (optional but used by routes)
    plan_price_id: { type: DataTypes.TEXT, allowNull: true },
    plan_interval: { type: DataTypes.ENUM("day", "week", "month", "year"), allowNull: true },
    plan_slug: { type: DataTypes.TEXT, allowNull: true },
    // Optional: lazy periodic grant tracking
    last_granted_period_start: { type: DataTypes.DATE, allowNull: true },
    last_granted_period_end: { type: DataTypes.DATE, allowNull: true },
  },
  {
    tableName: "subscriptions",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false,
  },
);

export const Plan = sequelize.define(
  "Plan",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    product_id: { type: DataTypes.TEXT, allowNull: false },
    price_id: { type: DataTypes.TEXT, allowNull: false, unique: true },
    plan_slug: { type: DataTypes.TEXT, allowNull: true },
    name: { type: DataTypes.TEXT, allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    plan_type: { type: DataTypes.ENUM("subscription", "one_time"), allowNull: false },
    interval: { type: DataTypes.ENUM("day", "week", "month", "year"), allowNull: true },
    unit_amount: { type: DataTypes.INTEGER, allowNull: false },
    currency: { type: DataTypes.TEXT, allowNull: false },
    grants_chat: { type: DataTypes.BOOLEAN, defaultValue: false },
    credit_type: { type: DataTypes.ENUM("superlike", "boost", "premium"), allowNull: true },
    credit_quantity: { type: DataTypes.INTEGER, defaultValue: 0 },
    // New: subscription entitlement metadata
    superlikes_per_period: { type: DataTypes.INTEGER, allowNull: true },
    superlike_period: {
      type: DataTypes.ENUM("day", "week", "month", "year", "none"),
      allowNull: true,
    },
    boosts_per_week: { type: DataTypes.INTEGER, allowNull: true },
    unlimited_swipes: { type: DataTypes.BOOLEAN, defaultValue: false },
    see_who_liked: { type: DataTypes.BOOLEAN, defaultValue: false },
    priority_support: { type: DataTypes.BOOLEAN, defaultValue: false },
    badge: { type: DataTypes.BOOLEAN, defaultValue: false },
    active: { type: DataTypes.BOOLEAN, defaultValue: true },
    sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  {
    tableName: "plans",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
);

/* ------------------------------- Credits / Boost --------------------------- */

export const UserCredit = sequelize.define(
  "UserCredit",
  {
    user_id: { type: DataTypes.UUID, primaryKey: true },
    superlike_credits: { type: DataTypes.INTEGER, defaultValue: 0 },
    boost_credits: { type: DataTypes.INTEGER, defaultValue: 0 },
    premium_tokens: { type: DataTypes.INTEGER, defaultValue: 0 },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    tableName: "user_credits",
    timestamps: false,
  },
);

export const UserCreditEvent = sequelize.define(
  "UserCreditEvent",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    type: { type: DataTypes.ENUM("superlike", "boost", "premium"), allowNull: false },
    delta: { type: DataTypes.INTEGER, allowNull: false },
    reason: { type: DataTypes.STRING },
  },
  {
    tableName: "user_credit_events",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false,
  },
);

export const UserBoost = sequelize.define(
  "UserBoost",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    activated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    expires_at: { type: DataTypes.DATE, allowNull: false },
  },
  {
    tableName: "user_boosts",
    timestamps: false,
  },
);

/* --------------------------- NEW: Profiles & Photos ------------------------ */

export const UserProfile = sequelize.define(
  "UserProfile",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: false, unique: true },

    // Extended details
    height_cm: { type: DataTypes.INTEGER, allowNull: true },
    weight_kg: { type: DataTypes.INTEGER, allowNull: true },

    looking_for: { type: DataTypes.STRING, allowNull: true }, // relationship|friendship|marriage|casual
    work: { type: DataTypes.STRING, allowNull: true },
    education: { type: DataTypes.STRING, allowNull: true },

    education_level: { type: DataTypes.STRING, allowNull: true }, // high_school|bachelors|masters|phd|other
    drinking: { type: DataTypes.STRING, allowNull: true }, // no|socially|often
    smoking: { type: DataTypes.STRING, allowNull: true }, // no|occasionally|regularly
    religion: { type: DataTypes.STRING, allowNull: true },

    languages: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    interests: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  },
  {
    tableName: "user_profiles",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [{ unique: true, fields: ["user_id"] }],
  },
);

export const UserPhoto = sequelize.define(
  "UserPhoto",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    user_id: { type: DataTypes.UUID, allowNull: false },
    url: { type: DataTypes.STRING, allowNull: false },
    storage_key: { type: DataTypes.STRING, allowNull: true },
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    is_primary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    tableName: "user_photos",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [{ fields: ["user_id"] }, { fields: ["user_id", "sort_order"] }],
  },
);

export const ProfileOption = sequelize.define(
  "ProfileOption",
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    // keep enum limited to the types we want db-driven
    type: {
      type: DataTypes.ENUM("looking_for", "education_level", "religion", "language", "interest"),
      allowNull: false,
    },
    slug: { type: DataTypes.STRING(60), allowNull: false }, // stable key to store on user
    label: { type: DataTypes.STRING(120), allowNull: false }, // what UI shows
    sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    meta: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    tableName: "profile_options",
    underscored: true,
    indexes: [
      { unique: true, fields: ["type", "slug"], name: "profile_options_type_slug_uq" },
      { fields: ["type", "is_active", "sort_order"] },
    ],
  },
);

/* -------------------------------- Associations ---------------------------- */

// Relations
UserRelation.belongsTo(User, { as: "actor", foreignKey: "actor_id" });
UserRelation.belongsTo(User, { as: "target", foreignKey: "target_id" });
User.hasMany(UserRelation, { as: "outgoing", foreignKey: "actor_id" });
User.hasMany(UserRelation, { as: "incoming", foreignKey: "target_id" });

// Messages
Message.belongsTo(User, { as: "sender", foreignKey: "sender_id" });
Message.belongsTo(User, { as: "receiver", foreignKey: "receiver_id" });

// Notifications
Notification.belongsTo(User, { as: "user", foreignKey: "user_id" });
Notification.belongsTo(User, { as: "actor", foreignKey: "actor_id" });

// Billing
Subscription.belongsTo(User, { as: "user", foreignKey: "user_id" });

// Credits
UserCredit.belongsTo(User, { as: "user", foreignKey: "user_id" });
UserCreditEvent.belongsTo(User, { as: "user", foreignKey: "user_id" });
UserCreditEvent.belongsTo(User, { as: "relatedUser", foreignKey: "related_user_id" });

// Boosts
UserBoost.belongsTo(User, { as: "user", foreignKey: "user_id" });

// NEW: Profile (1–1) and Photos (1–many)
User.hasOne(UserProfile, { as: "profile", foreignKey: "user_id", onDelete: "CASCADE" });
UserProfile.belongsTo(User, { as: "user", foreignKey: "user_id" });

User.hasMany(UserPhoto, { as: "photos", foreignKey: "user_id", onDelete: "CASCADE" });
UserPhoto.belongsTo(User, { as: "user", foreignKey: "user_id" });

/* --------------------------------- Sync ----------------------------------- */

export async function syncModels() {
  await sequelize.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
  await sequelize.sync();
}

export { sequelize };
