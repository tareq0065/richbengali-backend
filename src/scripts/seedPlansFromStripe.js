import "dotenv/config";
import { sequelize } from "../config/sequelize.js";
import { syncPlansFromProduct } from "../services/planSync.js";

const productId = process.argv[2] || process.env.STRIPE_DEFAULT_PRODUCT_ID;

if (!productId) {
  console.error("Usage: node src/scripts/seedPlansFromStripe.js <productId>");
  process.exit(1);
}

(async () => {
  try {
    await sequelize.authenticate();
    const { count } = await syncPlansFromProduct(productId);
    console.log(`Synced ${count} Stripe prices into plans.`);
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
})();
