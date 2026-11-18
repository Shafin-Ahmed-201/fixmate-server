import 'dotenv/config';
import { hashPassword } from '@better-auth/utils/password';
import {
  closeDB,
  collection,
  connectDB,
  users,
  services,
  bookings,
  payments,
} from '../config/db.js';

/**
 * FixMate demo data: 1 admin, 2 technicians, 2 customers,
 * 14 approved services (2 per category) and sample bookings.
 *
 * Idempotent: users are upserted by email, collections are only filled
 * when empty. Run with `npm run seed`.
 */

const SEED_PASSWORDS = {
  admin: 'Admin@1234',
  technician: 'Technician@123',
  customer: 'Customer@123',
};

const seedUsers = [
  {
    name: 'FixMate Admin',
    email: 'admin@fixmate.com',
    password: SEED_PASSWORDS.admin,
    role: 'admin',
    phone: '+8801700000001',
    area: 'Dhanmondi, Dhaka',
    bio: 'Platform administrator for FixMate.',
    image: 'https://i.pravatar.cc/150?img=12',
  },
  {
    name: 'Arif Hassan',
    email: 'arif.hassan@fixmate.com',
    password: SEED_PASSWORDS.technician,
    role: 'technician',
    phone: '+8801700000002',
    area: 'Mirpur, Dhaka',
    bio: 'Senior appliance & smartphone technician with 8 years of experience.',
    image: 'https://i.pravatar.cc/150?img=33',
  },
  {
    name: 'Sumaiya Khan',
    email: 'sumaiya.khan@fixmate.com',
    password: SEED_PASSWORDS.technician,
    role: 'technician',
    phone: '+8801700000003',
    area: 'Uttara, Dhaka',
    bio: 'AC, refrigerator and electrical specialist.',
    image: 'https://i.pravatar.cc/150?img=47',
  },
  {
    name: 'Rahim Uddin',
    email: 'rahim.customer@fixmate.com',
    password: SEED_PASSWORDS.customer,
    role: 'customer',
    phone: '+8801700000004',
    area: 'Gulshan, Dhaka',
    bio: '',
    image: 'https://i.pravatar.cc/150?img=15',
  },
  {
    name: 'Jasmin Akter',
    email: 'jasmin.customer@fixmate.com',
    password: SEED_PASSWORDS.customer,
    role: 'customer',
    phone: '+8801700000005',
    area: 'Banani, Dhaka',
    bio: '',
    image: 'https://i.pravatar.cc/150?img=25',
  },
];

const technician = (index) => (index % 2 === 0 ? seedUsers[1] : seedUsers[2]);

const seedServices = [
  {
    title: 'iPhone Screen Replacement',
    category: 'Smartphone',
    description:
      'Genuine OLED screen replacement for iPhone 11–15 models with 90-day warranty on parts and labour.',
    basePrice: 45,
    estimatedDuration: '1–2 hours',
    serviceMode: 'Home Visit',
    serviceArea: 'Dhanmondi, Gulshan, Uttara',
  },
  {
    title: 'Android Battery Replacement',
    category: 'Smartphone',
    description:
      'Fresh battery for any Android device showing rapid drain or unexpected shutdowns. Includes health check.',
    basePrice: 30,
    estimatedDuration: '45 minutes',
    serviceMode: 'Shop Drop-off',
    serviceArea: 'Mirpur, Mohammadpur',
  },
  {
    title: 'Laptop Hinge & Chassis Repair',
    category: 'Laptop & PC',
    description:
      'Fix broken or wobbly laptop hinges, cracked chassis and loose display assemblies on all major brands.',
    basePrice: 60,
    estimatedDuration: '2–3 hours',
    serviceMode: 'Shop Drop-off',
    serviceArea: 'Dhanmondi, Elephant Road',
  },
  {
    title: 'PC Diagnostic & Tune-up',
    category: 'Laptop & PC',
    description:
      'Full hardware diagnostic, malware cleanup, thermal paste replacement and OS optimisation for desktops.',
    basePrice: 40,
    estimatedDuration: '1–2 hours',
    serviceMode: 'Home Visit',
    serviceArea: 'Uttara, Bashundhara',
  },
  {
    title: 'AC Deep Cleaning & Gas Check',
    category: 'AC',
    description:
      'Split or window AC deep cleaning, coil servicing and refrigerant pressure check for peak cooling.',
    basePrice: 70,
    estimatedDuration: '2 hours',
    serviceMode: 'Home Visit',
    serviceArea: 'Gulshan, Banani, Baridhara',
  },
  {
    title: 'AC Compressor Repair',
    category: 'AC',
    description:
      'Diagnosis and repair of compressor faults, warm airflow and unusual noises in split AC units.',
    basePrice: 120,
    estimatedDuration: '3 hours',
    serviceMode: 'Home Visit',
    serviceArea: 'Dhanmondi, Mirpur',
  },
  {
    title: 'Refrigerator Not Cooling Repair',
    category: 'Refrigerator',
    description:
      'Root-cause repair for fridges that are not cooling — thermostat, fan, relay and gas leak checks included.',
    basePrice: 85,
    estimatedDuration: '2 hours',
    serviceMode: 'Home Visit',
    serviceArea: 'Mohammadpur, Dhanmondi',
  },
  {
    title: 'Fridge Door Seal Replacement',
    category: 'Refrigerator',
    description:
      'Replace worn magnetic door gaskets that cause frost build-up and energy waste in any refrigerator.',
    basePrice: 55,
    estimatedDuration: '1–2 hours',
    serviceMode: 'Home Visit',
    serviceArea: 'Uttara, Pallabi',
  },
  {
    title: 'TV Wall Mount & Setup',
    category: 'TV',
    description:
      'Secure wall mounting for 32–65 inch TVs, cable management and streaming app setup by a certified installer.',
    basePrice: 50,
    estimatedDuration: '1 hour',
    serviceMode: 'Home Visit',
    serviceArea: 'Banani, Gulshan, Badda',
  },
  {
    title: 'Smart TV Software Reset',
    category: 'TV',
    description:
      'Fix frozen smart TVs, app crashes and update failures with a safe firmware reset and reconfiguration.',
    basePrice: 35,
    estimatedDuration: '45 minutes',
    serviceMode: 'Shop Drop-off',
    serviceArea: 'Dhanmondi, Kalabagan',
  },
  {
    title: 'Washing Machine Drum Cleaning',
    category: 'Washing Machine',
    description:
      'Front or top load drum descaling, mould removal and smell treatment for cleaner, quieter washes.',
    basePrice: 65,
    estimatedDuration: '1–2 hours',
    serviceMode: 'Home Visit',
    serviceArea: 'Mirpur, Kafrul',
  },
  {
    title: 'Washer Drain Pump Replacement',
    category: 'Washing Machine',
    description:
      'Replace faulty drain pumps causing standing water, error codes and failed spin cycles.',
    basePrice: 90,
    estimatedDuration: '2 hours',
    serviceMode: 'Home Visit',
    serviceArea: 'Dhanmondi, Hazaribagh',
  },
  {
    title: 'Full Home Circuit Inspection',
    category: 'Electrical',
    description:
      'Safety inspection of sockets, breakers and wiring across your home with a written condition report.',
    basePrice: 110,
    estimatedDuration: '3 hours',
    serviceMode: 'Home Visit',
    serviceArea: 'All Dhaka zones',
  },
  {
    title: 'Socket & Switch Replacement',
    category: 'Electrical',
    description:
      'Replace damaged sockets, switches and dimmers with proper grounding and load testing.',
    basePrice: 45,
    estimatedDuration: '1 hour',
    serviceMode: 'Home Visit',
    serviceArea: 'Gulshan, Banani, Dhaka',
  },
];

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function buildSeedBookings(serviceDocs) {
  const [customer1, customer2] = [seedUsers[3], seedUsers[4]];
  const pick = (index) => serviceDocs[index];

  const rows = [
    {
      service: pick(0),
      customer: customer1,
      status: 'requested',
      preferredOffset: 3,
      createdDaysAgo: 1,
      problemDescription:
        'My iPhone 13 screen cracked after a fall and the touch is unresponsive in the top corner.',
    },
    {
      service: pick(4),
      customer: customer1,
      status: 'accepted',
      preferredOffset: 2,
      createdDaysAgo: 2,
      problemDescription:
        'The AC in the master bedroom is blowing warm air and makes a clicking sound after ten minutes.',
    },
    {
      service: pick(6),
      customer: customer2,
      status: 'in-progress',
      preferredOffset: 0,
      createdDaysAgo: 3,
      problemDescription:
        'Refrigerator stopped cooling overnight though the light still works and the freezer has frost.',
    },
    {
      service: pick(8),
      customer: customer2,
      status: 'completed',
      preferredOffset: -2,
      createdDaysAgo: 6,
      finalAmount: 60,
      problemDescription:
        'Please mount a 55 inch TV in the living room and hide the cables behind the wall.',
    },
    {
      service: pick(2),
      customer: customer1,
      status: 'completed',
      paymentStatus: 'paid',
      preferredOffset: -7,
      createdDaysAgo: 12,
      finalAmount: 75,
      problemDescription:
        'Laptop hinge snapped on the left side so the screen no longer stays upright on its own.',
    },
    {
      service: pick(10),
      customer: customer1,
      status: 'cancelled',
      preferredOffset: 1,
      createdDaysAgo: 8,
      problemDescription:
        'Washing machine smells mouldy after every cycle and leaves residue on dark clothes.',
    },
    {
      service: pick(12),
      customer: customer2,
      status: 'rejected',
      preferredOffset: 4,
      createdDaysAgo: 9,
      problemDescription:
        'Need an inspection of the kitchen circuit because the breaker trips when the kettle runs.',
    },
  ];

  return rows.map((row) => {
    const now = new Date();
    const preferredDate = new Date();
    preferredDate.setDate(preferredDate.getDate() + row.preferredOffset);

    const history = [{ status: 'requested', changedAt: daysAgo(row.createdDaysAgo) }];
    const order = ['requested', 'accepted', 'in-progress', 'completed'];
    if (row.status !== 'requested' && row.status !== 'cancelled' && row.status !== 'rejected') {
      for (const step of order.slice(1, order.indexOf(row.status) + 1)) {
        history.push({ status: step, changedAt: daysAgo(Math.max(0, row.createdDaysAgo - 1)) });
      }
    }
    if (row.status === 'cancelled' || row.status === 'rejected') {
      history.push({ status: row.status, changedAt: daysAgo(Math.max(0, row.createdDaysAgo - 1)) });
    }

    return {
      serviceId: row.service._id,
      serviceTitle: row.service.title,
      serviceImage: row.service.image,
      category: row.service.category,
      basePrice: row.service.basePrice,
      technicianName: row.service.technicianName,
      technicianEmail: row.service.technicianEmail,
      customerName: row.customer.name,
      customerEmail: row.customer.email,
      customerPhone: row.customer.phone,
      address: `${12 + order.length} Lake View Road, ${row.customer.area}`,
      preferredDate,
      problemDescription: row.problemDescription,
      status: row.status,
      finalAmount: row.finalAmount ?? row.service.basePrice,
      paymentStatus: row.paymentStatus ?? 'unpaid',
      statusHistory: history,
      createdAt: daysAgo(row.createdDaysAgo),
      updatedAt: now,
    };
  });
}

async function upsertSeedUsers() {
  const created = [];
  for (const data of seedUsers) {
    const existing = await users().findOne({ email: data.email });
    if (existing) continue;

    const now = new Date();
    const { insertedId } = await users().insertOne({
      name: data.name,
      email: data.email,
      emailVerified: true,
      image: data.image,
      role: data.role,
      phone: data.phone,
      area: data.area,
      bio: data.bio,
      createdAt: now,
      updatedAt: now,
    });

    await collection('account').insertOne({
      userId: insertedId,
      accountId: insertedId.toString(),
      providerId: 'credential',
      password: await hashPassword(data.password),
      createdAt: now,
      updatedAt: now,
    });

    created.push(data.email);
  }
  return created;
}

async function seedServicesIfEmpty() {
  if ((await services().countDocuments()) > 0) return 0;

  const now = new Date();
  const docs = seedServices.map((service, index) => {
    const owner = technician(index);
    const createdAt = daysAgo(seedServices.length - index);
    return {
      ...service,
      image: `https://picsum.photos/seed/fixmate-${service.category.replace(/\W+/g, '-').toLowerCase()}-${index}/640/420`,
      technicianName: owner.name,
      technicianEmail: owner.email,
      approvalStatus: 'approved',
      isAvailable: true,
      createdAt,
      updatedAt: now,
    };
  });

  await services().insertMany(docs);
  return docs.length;
}

async function seedBookingsIfEmpty() {
  if ((await bookings().countDocuments()) > 0) return 0;

  const serviceDocs = await services().find({}).toArray();
  const docs = buildSeedBookings(serviceDocs);
  const { insertedIds } = await bookings().insertMany(docs);

  // One historical payment so the admin revenue chart is not empty.
  const paidIndex = docs.findIndex((doc) => doc.paymentStatus === 'paid');
  if (paidIndex !== -1 && (await payments().countDocuments()) === 0) {
    const paidBooking = docs[paidIndex];
    await payments().insertOne({
      bookingId: insertedIds[paidIndex],
      serviceTitle: paidBooking.serviceTitle,
      customerName: paidBooking.customerName,
      customerEmail: paidBooking.customerEmail,
      technicianName: paidBooking.technicianName,
      technicianEmail: paidBooking.technicianEmail,
      amount: paidBooking.finalAmount,
      currency: 'usd',
      transactionId: `seed_pi_${insertedIds[paidIndex].toString()}`,
      stripeSessionId: `seed_cs_${insertedIds[paidIndex].toString()}`,
      paymentStatus: 'paid',
      paidAt: daysAgo(10),
    });
  }

  return docs.length;
}

async function main() {
  await connectDB();

  const createdUsers = await upsertSeedUsers();
  const serviceCount = await seedServicesIfEmpty();
  const bookingCount = await seedBookingsIfEmpty();

  console.log('\nSeed complete ✓');
  console.log(`  new users:     ${createdUsers.length}`);
  console.log(`  new services:  ${serviceCount}`);
  console.log(`  new bookings:  ${bookingCount}`);
  console.log('\nCredentials (email → password):');
  console.log(`  admin       admin@fixmate.com        → ${SEED_PASSWORDS.admin}`);
  console.log(`  technician  arif.hassan@fixmate.com  → ${SEED_PASSWORDS.technician}`);
  console.log(`  technician  sumaiya.khan@fixmate.com → ${SEED_PASSWORDS.technician}`);
  console.log(`  customer    rahim.customer@fixmate.com → ${SEED_PASSWORDS.customer}`);
  console.log(`  customer    jasmin.customer@fixmate.com → ${SEED_PASSWORDS.customer}\n`);
}

main()
  .then(closeDB)
  .catch(async (err) => {
    console.error('Seed failed:', err);
    await closeDB().catch(() => {});
    process.exit(1);
  });
