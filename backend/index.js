const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bodyParser = require("body-parser");
const validator = require("validator");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error(err));

// Schema and Model
const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  verificationCode: { type: String, required: false }, // Verification code
  isVerified: { type: Boolean, default: false }, // Email verification status
  gender: { type: String, required: false },
  dateOfBirth: { type: Date, required: false },
  isStudentOrWorking: { type: String, enum: ["Student", "Working"], required: false },
  highestEducationLevel: { type: String, required: false },
  trackAppliedFor: { type: String, enum: ["Product Design", "Front-end", "Data Analysis"], required: false },
  reliableInternetConnection: { type: String, enum: ["Yes", "No"], required: false },
  accessibilityNeeds: { type: String, enum: ["Yes", "No"], required: false },
  country: { type: String, required: false },
  state: { type: String, required: false },
  hearAboutUs: { type: String, required: false },
  admissionNumber: { type: String, required: false, unique: true },
});

// Model
const User = mongoose.model("User", userSchema);

// Nodemailer Transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Helper functions
const generateAdmissionNumber = async () => {
  const year = new Date().getFullYear();
  const prefix = "I2I";
  const count = await User.countDocuments();
  return `${prefix}${year}${String(count + 1).padStart(4, "0")}`;
};

const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
};

// Routes

// Step 1: Register basic info and send verification email
app.post("/api/users", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
    } = req.body;


    // Validate email
    if (!validator.isEmail(email)) {
      return res.status(400).json({ message: "Invalid email address" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already exists." });
    }

    const verificationCode = generateVerificationCode();
    const admissionNumber = await generateAdmissionNumber();

    const newUser = new User({
      firstName,
      lastName,
      email,
      phone,
      verificationCode,
      admissionNumber,
    });

    await newUser.save();

    // Send verification email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Email Verification Code",
      text: `Your verification code is ${verificationCode}`,
    });

    res.status(201).json({ message: "User registered. Verification code sent to email." });
  } catch (error) {
    res.status(500).json({ message: "Error saving user", error });
  }
});

// Step 2: Verify email
app.post("/api/users/verify", async (req, res) => {
  try {
    const { email, verificationCode } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.verificationCode !== verificationCode) {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    user.isVerified = true;
    await user.save();

    res.status(200).json({ message: "Email verified successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error verifying email", error });
  }
});

// Step 3: Update additional details after email verification
app.put("/api/users/details/:email", async (req, res) => {
  try {
    const {
      gender,
      dateOfBirth,
      isStudentOrWorking,
      highestEducationLevel,
      trackAppliedFor,
      reliableInternetConnection,
      accessibilityNeeds,
      country,
      state,
      hearAboutUs
    } = req.body;

    const user = await User.findOne({ email: req.params.email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update user details
    user.gender = gender;
    user.dateOfBirth = new Date(dateOfBirth);
    user.isStudentOrWorking = isStudentOrWorking;
    user.highestEducationLevel = highestEducationLevel;
    user.trackAppliedFor = trackAppliedFor;
    user.reliableInternetConnection = reliableInternetConnection;
    user.accessibilityNeeds = accessibilityNeeds;
    user.country = country;
    user.state = state;
    user.hearAboutUs = hearAboutUs;

    await user.save();

    res.status(200).json({ message: "User details updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error updating user details", error });
  }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));