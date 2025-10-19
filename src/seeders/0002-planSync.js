export const up = async ({ context: queryInterface }) => {
  const { syncPlansFromProduct } = await import("../services/planSync.js");
  await syncPlansFromProduct();
};

// No-op; keep for symmetry (Umzug won’t require it, but it’s fine to have)
export const down = async ({ context: queryInterface }) => {
  // Intentionally left blank (do not delete plans on down)
};
