/** @type {import('umzug').MigrationFn} */
export const up = async ({ context: qi }) => {
  const users = [
    {
      id: "11111111-1111-1111-1111-111111111111",
      email: "alice@example.com",
      password_hash: "$2a$10$2wlZFZhNMwc7AswvQD2lYuv7Qkeqv/tXFVFl/t6x9niK0UPDYOpF.", // '123456'
      name: "Alice",
      age: 25,
      gender: "female",
      city: "London",
    },
    {
      id: "22222222-2222-2222-2222-222222222222",
      email: "bob@example.com",
      password_hash: "$2a$10$2wlZFZhNMwc7AswvQD2lYuv7Qkeqv/tXFVFl/t6x9niK0UPDYOpF.",
      name: "Bob",
      age: 29,
      gender: "male",
      city: "Paris",
    },
    {
      id: "33333333-3333-3333-3333-333333333333",
      email: "clara@example.com",
      password_hash: "$2a$10$2wlZFZhNMwc7AswvQD2lYuv7Qkeqv/tXFVFl/t6x9niK0UPDYOpF.",
      name: "Clara",
      age: 31,
      gender: "female",
      city: "New York",
    },
  ];
  for (const u of users) {
    await qi.bulkInsert("users", [{ ...u, created_at: new Date() }]);
  }
};

export const down = async ({ context: qi }) => {
  await qi.bulkDelete("users", {
    email: ["alice@example.com", "bob@example.com", "clara@example.com"],
  });
};
