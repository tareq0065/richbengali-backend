export const maskEmail = (email) => {
  if (!email) return null;
  const [user, domain] = email.split("@");
  const maskedUser =
    user.length <= 2
      ? user[0] + "*"
      : user[0] + "*".repeat(user.length - 2) + user[user.length - 1];
  return `${maskedUser}@${domain}`;
};
export const maskPhone = (phone) => (phone ? phone.replace(/\d(?=\d{2})/g, "*") : null);

export function toProfileView(user, profile, photos) {
  // 1) start from the full user JSON (this includes computed attributes like is_liked, etc.)
  const core = user?.toJSON ? user.toJSON() : user || {};

  // 2) strip sensitive fields that must never leak
  delete core.password_hash;

  // 3) flatten profile on top (but don't nuke user core). Remove db-internal fields.
  const p = profile?.toJSON ? profile.toJSON() : profile || {};
  const { id: _pid, user_id: _puid, created_at: _pca, updated_at: _pua, ...profileFields } = p;

  // 4) photos -> slim view, sorted by sort_order ASC
  const ph = Array.isArray(photos) ? photos : [];
  const photoView = ph
    .map((x) => (x?.toJSON ? x.toJSON() : x))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((x) => ({
      id: x.id,
      url: x.url,
      sort_order: x.sort_order ?? 0,
      is_primary: !!x.is_primary,
    }));

  // 5) merge: core first (keeps computed flags), then profile fields, then photos array
  return {
    ...core, // includes: is_liked, is_favorited, is_superliked, is_boosted, etc.
    ...profileFields, // overlays extended fields (height_cm, looking_for, ...)
    photos: photoView,
  };
}

export const toMeView = (user, profile, photos = []) => ({
  // core
  id: user.id,
  email: user.email,
  phone: user.phone,
  name: user.name,
  age: user.age,
  gender: user.gender,
  city: user.city,
  profile_picture_url: user.profile_picture_url,
  is_premium: user.is_premium,

  // extended
  height_cm: profile?.height_cm ?? null,
  weight_kg: profile?.weight_kg ?? null,
  looking_for: profile?.looking_for ?? null,
  work: profile?.work ?? null,
  education: profile?.education ?? null,
  education_level: profile?.education_level ?? null,
  drinking: profile?.drinking ?? null,
  smoking: profile?.smoking ?? null,
  religion: profile?.religion ?? null,
  languages: profile?.languages ?? [],
  interests: profile?.interests ?? [],

  // photos
  photos: photos.map((p) => ({
    id: p.id,
    url: p.url,
    sort_order: p.sort_order,
    is_primary: p.is_primary,
  })),
});
