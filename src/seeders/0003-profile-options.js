// ESM + Umzug v3 style (no CommonJS)
// Seeds initial lookup rows for profile_options

export const up = async ({ context: queryInterface }) => {
  const now = queryInterface.sequelize.fn("NOW");

  const mk = (type, slug, label, sort) => ({
    type,
    slug,
    label,
    sort_order: sort,
    is_active: true,
    meta: null,
    created_at: now,
    updated_at: now,
  });

  await queryInterface.bulkInsert("profile_options", [
    // looking_for
    mk("looking_for", "relationship", "Relationship", 1),
    mk("looking_for", "friendship", "Friendship", 2),
    mk("looking_for", "marriage", "Marriage", 3),
    mk("looking_for", "casual", "Casual", 4),

    // education_level
    mk("education_level", "high_school", "High School", 1),
    mk("education_level", "bachelors", "Bachelors", 2),
    mk("education_level", "masters", "Masters", 3),
    mk("education_level", "phd", "PhD", 4),
    mk("education_level", "other", "Other", 5),

    // religion
    mk("religion", "islam", "Islam", 1),
    mk("religion", "hinduism", "Hinduism", 2),
    mk("religion", "buddhism", "Buddhism", 3),
    mk("religion", "christianity", "Christianity", 4),
    mk("religion", "atheist", "Atheist", 5),
    mk("religion", "agnostic", "Agnostic", 6),
    mk("religion", "other", "Other", 7),

    // language
    mk("language", "bangla", "Bangla", 1),
    mk("language", "english", "English", 2),
    mk("language", "hindi", "Hindi", 3),
    mk("language", "urdu", "Urdu", 4),
    mk("language", "arabic", "Arabic", 5),
    mk("language", "spanish", "Spanish", 6),
    mk("language", "french", "French", 7),
    mk("language", "german", "German", 8),
    mk("language", "chinese", "Chinese", 9),
    mk("language", "japanese", "Japanese", 10),
    mk("language", "korean", "Korean", 11),

    // interest
    mk("interest", "travel", "Travel", 1),
    mk("interest", "music", "Music", 2),
    mk("interest", "movies", "Movies", 3),
    mk("interest", "fitness", "Fitness", 4),
    mk("interest", "books", "Books", 5),
    mk("interest", "cooking", "Cooking", 6),
    mk("interest", "gaming", "Gaming", 7),
    mk("interest", "photography", "Photography", 8),
    mk("interest", "hiking", "Hiking", 9),
    mk("interest", "tech", "Tech", 10),
    mk("interest", "art", "Art", 11),
    mk("interest", "dancing", "Dancing", 12),
    mk("interest", "yoga", "Yoga", 13),
    mk("interest", "cycling", "Cycling", 14),
  ]);
};

export const down = async ({ context: queryInterface }) => {
  // Minimal cleanup: remove only the rows we inserted (by type filter)
  await queryInterface.bulkDelete("profile_options", {
    type: ["looking_for", "education_level", "religion", "language", "interest"],
  });
};
