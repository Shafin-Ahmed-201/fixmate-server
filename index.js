import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(express.json());
app.use(cors());
const client = new MongoClient(`mongodb://${process.env.DB_USER}:${process.env.DB_PASSWORD}@ac-php7rd4-shard-00-00.8bihj8d.mongodb.net:27017,ac-php7rd4-shard-00-01.8bihj8d.mongodb.net:27017,ac-php7rd4-shard-00-02.8bihj8d.mongodb.net:27017/?ssl=true&replicaSet=atlas-fmvmrf-shard-0&authSource=admin`);


const myLogger = (req, res, next) => {
    console.log('now hitting api', req.url, req.headers)
    next();
}

export async function connectToMongoDB() {
    try {
        await client.connect();
        console.log("You successfully connected to MongoDB!");
        return client;
    } catch (err) {
        console.dir(err);
    }
}

const connectedClient = await connectToMongoDB();
const database = connectedClient.db("fixmatedb");

app.get('/', (req, res) => {
    res.send('hire loop is looping')
})

const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.status(401).send({ message: 'Unauthorized' });
        return;
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
        res.status(401).send({ message: 'Unauthorized' });
        return;
    }

    const query = { token };
    const session = await sessions.findOne(query);
    if (!session) {
        res.status(401).send({ message: 'Unauthorized' });
        return;
    }

    const userId = session.userId;

    const userQuery = { _id: new ObjectId(userId) };
    const user = await users.findOne(userQuery);
    if (!user) {
        res.status(401).send({ message: 'Unauthorized' });
        return;
    }

    req.user = user;
    next();
}

// must call this middleware after verifyToken
const verifySeeker = async (req, res, next) => {
    if (req.user.role !== 'customer') {
        res.status(403).send({ message: 'Forbidden' });
        return;
    }
    next();
}

const verifyRecruiter = async (req, res, next) => {
    if (req.user.role !== 'technician') {
        res.status(403).send({ message: 'Forbidden' });
        return;
    }
    next();
}

const verifyAdmin = async (req, res, next) => {
    if (req.user.role !== 'admin') {
        res.status(403).send({ message: 'Forbidden' });
        return;
    }
    next();
}

// users related apis
app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
    const cursor = users.find({});
    const result = await cursor.toArray();
    res.send(result);
})

// payments related apis
app.post('/payments/checkout-verify', async (req, res) => {
    const { sessionId } = req.body;

    if (!sessionId) {
        return res.send({ success: false, message: 'Session ID is required' });
    }

    const {
        status,
        payment_status,
        customer_email,
        metadata,
        payment_intent,
    } = await stripe.checkout.sessions.retrieve(sessionId);

    // 1. is used new session 
    // 2. check is the session id for the currently logged in user
    // 3. insert sessionId into the payment Collection
    // 4. update user information as premium user

    if (status === 'complete' && payment_status === 'paid') {

        const sessionQuery = { sessionId };
        const existingPayment = await payments.findOne(sessionQuery);
        if (existingPayment) {
            return res.send({ success: false, message: 'Payment already verified' });
        }
        const payment = {
            sessionId,
            status,
            payment_status,
            customer_email,
            userId: metadata.userId,
            payment_date: new Date(),
            payment_intent,
        }

        const result = await payments.insertOne(payment);

        // update the user table
        const query = { _id: new ObjectId(metadata.userId) };

        const updatedDoc = {
            $set: {
                premium: true,
            }
        }
        const updateResult = await users.updateOne(
            query,
            updatedDoc
        );
        res.send({ success: true, result, updateResult });
        return
    }
    res.send({ success: false, message: 'Payment verification failed' });
})

app.listen(port, () => {
    console.log(`fixmate is running on port ${port}`)
})

export default app;