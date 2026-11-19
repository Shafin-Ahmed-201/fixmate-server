import { MongoClient, ObjectId } from 'mongodb';

const DEFAULT_DB_NAME = 'fixmateDB';

let client = null;
let database = null;

/** Opens the shared MongoDB connection (idempotent). */
export async function connectDB() {
  if (database) return database;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is missing — add it to your .env file');

  client = new MongoClient(uri, { maxPoolSize: 10 });
  await client.connect();

  database = client.db(process.env.DB_NAME || DEFAULT_DB_NAME);
  await ensureIndexes(database);
  console.log(`[db] connected → ${database.databaseName}`);
  return database;
}

/**
 * Best-effort index creation. BetterAuth owns the auth collections and may
 * have already created identical indexes — conflicts are logged, not fatal.
 */
async function ensureIndexes(db) {
  const definitions = [
    ['user', [{ key: { email: 1 }, name: 'uniq_user_email', unique: true }]],
    [
      'services',
      [
        { key: { approvalStatus: 1, isAvailable: 1 }, name: 'idx_service_visibility' },
        { key: { technicianEmail: 1 }, name: 'idx_service_technician' },
        { key: { category: 1 }, name: 'idx_service_category' },
      ],
    ],
    [
      'bookings',
      [
        { key: { customerEmail: 1, status: 1 }, name: 'idx_booking_customer' },
        { key: { technicianEmail: 1, status: 1 }, name: 'idx_booking_technician' },
        { key: { serviceId: 1 }, name: 'idx_booking_service' },
      ],
    ],
    [
      'payments',
      [
        { key: { stripeSessionId: 1 }, name: 'uniq_payment_session', unique: true },
        { key: { bookingId: 1 }, name: 'idx_payment_booking' },
        { key: { customerEmail: 1 }, name: 'idx_payment_customer' },
      ],
    ],
  ];

  for (const [name, indexes] of definitions) {
    for (const index of indexes) {
      const options = { name: index.name };
      if (index.unique) options.unique = true;
      try {
        await db.collection(name).createIndex(index.key, options);
      } catch (err) {
        // console.warn(`[db] skipped index ${name}.${index.name}: ${err.message}`);
      }
    }
  }
}

/** Returns the active database handle. */
export function getDB() {
  if (!database) throw new Error('Database not connected — call connectDB() first');
  return database;
}

export const collection = (name) => getDB().collection(name);

/** Collection helpers — BetterAuth stores people in `user`. */
export const users = () => collection('user');
export const services = () => collection('services');
export const bookings = () => collection('bookings');
export const payments = () => collection('payments');

/** Converts a 24-char hex string to ObjectId, or null when invalid. */
export const toObjectId = (value) =>
  typeof value === 'string' && /^[0-9a-f]{24}$/i.test(value) ? new ObjectId(value) : null;

/** Closes the connection on shutdown. */
export async function closeDB() {
  if (client) {
    await client.close();
    client = null;
    database = null;
  }
}
