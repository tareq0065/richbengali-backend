import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email({ message: "invalid email address" }),
  password: z.string().min(6, { message: "password must be at least 6 characters" }),
  code: z.string().regex(/^\d{6}$/, { message: "code must be a 6-digit string" }),
  phone: z.string().optional().nullable(),
  name: z.string().min(1, { message: "name is required" }),
  age: z.coerce.number().int().gte(18, { message: "age must be 18 or above" }),
  gender: z.enum(["male", "female", "other"]).default("other"),
  city: z.string().optional().nullable(),
  profilePictureUrl: z.string().url({ message: "invalid url" }).optional().nullable(),
  fcmToken: z.string().optional().nullable(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const phoneLoginSchema = z.object({
  idToken: z.string().min(10),
  fcmToken: z.string().optional().nullable(),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(6),
});

export const usersListQuerySchema = z
  .object({
    cityStartsWith: z.string().min(1).optional(),
    minAge: z.coerce.number().int().gte(18).optional(),
    maxAge: z.coerce.number().int().gte(18).optional(),
  })
  .refine((v) => v.minAge == null || v.maxAge == null || v.minAge <= v.maxAge, {
    message: "minAge must be <= maxAge",
    path: ["minAge"],
  });

export const userIdParamSchema = z.object({
  id: z.string().uuid(),
});

export const relationParamSchema = z.object({
  targetId: z.string().uuid(),
  kind: z.enum(["like", "favorite"]),
});

export const superlikeParamSchema = z.object({
  targetId: z.string().uuid(),
});

export const creditsUseSchema = z.object({
  type: z.enum(["superlike", "boost", "premium"]),
});

export const stripeCheckoutSchema = z
  .object({
    // Allow any string plan slug (e.g., "price_price_..."), but validate more strictly below
    plan: z.string().min(1).optional(),
    price_id: z.string().startsWith("price_").optional(),
  })
  .superRefine((v, ctx) => {
    const hasPlan = typeof v.plan === "string" && v.plan.length > 0;
    const hasPrice = typeof v.price_id === "string" && v.price_id.startsWith("price_");

    if (!hasPlan && !hasPrice) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either plan or price_id must be provided",
        path: ["plan"],
      });
      return;
    }

    // If price_id is missing, restrict plan to the known enum set
    if (!hasPrice && hasPlan) {
      const allowed = ["weekly", "monthly", "yearly", "superlike", "boost", "premium"];
      if (!allowed.includes(v.plan)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Invalid plan when price_id is missing. Expected 'weekly' | 'monthly' | 'yearly' | 'superlike' | 'boost' | 'premium'",
          path: ["plan"],
        });
      }
    }
  });

export const updateProfileSchema = z.object({
  height_cm: z.number().int().min(80).max(250).optional().nullable(),
  weight_kg: z.number().int().min(30).max(250).optional().nullable(),
  looking_for: z.string().max(60).optional().nullable(),
  work: z.string().max(120).optional().nullable(),
  education: z.string().max(120).optional().nullable(),
  education_level: z.string().max(60).optional().nullable(),
  drinking: z.enum(["no", "socially", "often"]).optional().nullable(),
  smoking: z.enum(["no", "occasionally", "regularly"]).optional().nullable(),
  religion: z.string().max(60).optional().nullable(),
  languages: z.array(z.string().max(60)).max(12).optional(),
  interests: z.array(z.string().max(60)).max(20).optional(),
});

export const updateMeSchema = z.object({
  // core user fields
  name: z.string().min(1).max(120).optional(),
  age: z.coerce.number().int().min(18).max(120).optional(),
  gender: z.enum(["male", "female", "other"]).optional(),
  city: z.string().max(120).nullable().optional(),
  profile_picture_url: z.string().url().nullable().optional(),

  // extended profile fields
  height_cm: z.coerce.number().int().min(80).max(250).nullable().optional(),
  weight_kg: z.coerce.number().int().min(30).max(250).nullable().optional(),
  looking_for: z.enum(["relationship", "friendship", "marriage", "casual"]).nullable().optional(),
  work: z.string().max(120).nullable().optional(),
  education: z.string().max(120).nullable().optional(),
  education_level: z
    .enum(["high_school", "bachelors", "masters", "phd", "other"])
    .nullable()
    .optional(),
  drinking: z.enum(["no", "socially", "often"]).nullable().optional(),
  smoking: z.enum(["no", "occasionally", "regularly"]).nullable().optional(),
  religion: z.string().max(60).nullable().optional(),
  languages: z.array(z.string().max(40)).max(12).optional(),
  interests: z.array(z.string().max(40)).max(20).optional(),
});
