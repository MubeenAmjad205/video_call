const { betterAuth } = require('better-auth');
const { mongodbAdapter } = require('better-auth/adapters/mongodb');
const { toNodeHandler } = require('better-auth/node');
const { anonymous } = require('better-auth/plugins');
const { MongoClient } = require('mongodb');
const mongoose = require('mongoose');

const MONGO_URI = 'mongodb://127.0.0.1:27017/video-call';

// Connect Mongoose for the rest of the application
mongoose.connect(MONGO_URI)
  .then(() => console.log('Mongoose connected successfully'))
  .catch(err => console.error('Mongoose connection error:', err));

// Better-Auth requires a native MongoDB db instance.
// We instantiate a MongoClient synchronously so the auth object can be exported immediately.
const mongoClient = new MongoClient(MONGO_URI);
mongoClient.connect().catch(console.error);
const db = mongoClient.db();

const auth = betterAuth({
  database: mongodbAdapter(db),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    anonymous()
  ],
  baseURL: 'http://localhost:4000',
  trustedOrigins: ['http://localhost:3000']
});

module.exports = { auth, toNodeHandler };
