const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const cors = require("cors");
const bodyParser = require("body-parser");
const validator = require("validator");
const nodemailer = require("nodemailer");
const XLSX = require("xlsx");
const path = require("path");

require("dotenv").config();

const app = express();

const upload = multer({ dest: "uploads/" });

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ limit: "1mb", extended: true }));

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
  hasLaptop: { type: String, required: true, enum: ["Yes", "No"] },
  motivationLetter: { type: String, required: true },
  isCommitted: { type: Boolean, required: true },
  verificationCode: { type: String, required: false }, // Verification code
  isVerified: { type: Boolean, default: false }, // Email verification status
  gender: { type: String, required: false },
  dateOfBirth: { type: Date, required: false },
  isStudentOrWorking: { type: String, enum: ["Student", "Employed", "Not Employed"], required: false },
  highestEducationLevel: { type: String, required: false },
  trackAppliedFor: { type: String, enum: ["Product Design", "Front-end", "Data Analysis"], required: false },
  reliableInternetConnection: { type: String, enum: ["Yes", "No"], required: false },
  accessibilityNeeds: { type: String, enum: ["Yes", "No"], required: false },
  country: { type: String, required: false },
  state: { type: String, required: false },
  city: { type: String, required: false },
  hearAboutUs: { type: String, required: false },
  admissionNumber: { type: String, required: false, unique: true },
  status: { type: String, default: "Pending" },
});

const EmailLogSchema = new mongoose.Schema({
  name: String,
  email: String,
  code: String,
  status: String,
  timestamp: { type: Date, default: Date.now }
});

// Model
const User = mongoose.model("User", userSchema);

const EmailLog = mongoose.model("EmailLog", EmailLogSchema);

let clients = [];
let progress = { sentCount: 0, totalEmails: 0 };

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
  // const count = await User.countDocuments();
  const rand = Math.floor(100000 + Math.random() * 900000).toString().slice(-4); // 4-digit random number
  return `${prefix}${year}${String(rand).padStart(4, "0")}`;
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
      hasLaptop,
      motivationLetter,
      isCommitted
    } = req.body;


    // Validate email
    if (!validator.isEmail(email)) {
      return res.status(400).json({ message: "Invalid email address" });
    }

    if (motivationLetter.split(" ").length > 150) {
      return res.status(400).json({ message: "Motivation letter must not be more than 150 words" });
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
      hasLaptop,
      motivationLetter,
      isCommitted,
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

    res.status(201).json({ message: "User registered. Please check your email for your verification code." });
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
      city,
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
    user.city = city;
    user.hearAboutUs = hearAboutUs;

    await user.save();

    res.status(200).json({ message: "User details updated successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error updating user details", error });
  }
});

// Fetch all registered users
app.get('/api/registrations', async (req, res) => {
  try {
    const registrations = await User.find(); // Replace with your DB query
    res.json(registrations);
  } catch (error) {
    res.status(500).send('Error fetching registrations');
  }
});

// Route to generate and download Excel file
app.post("/api/users/download", (req, res) => {
  try {
    const users = req.body.users;
    if (!users || users.length === 0) {
      return res.status(400).json({ message: "No users provided" });
    }

    const userData = users.map((user, index) => ({
      Number: index + 1,
      Name: `${user.firstName} ${user.lastName}`,
      Email: user.email,
      Phone: user.phone,
      DateOfBirth: user.dateOfBirth,
      HasLaptop: user.hasLaptop,
      Gender: user.gender,
      Country: user.country,
      State: user.state,
      City: user.city,
      MotivationLetter: user.motivationLetter,
      ReliableInternetConnection: user.reliableInternetConnection,
      AccessibilityNeeds: user.accessibilityNeeds,
      IsStudentOrWorking: user.isStudentOrWorking,
      HighestEducationLevel: user.highestEducationLevel,
      TrackAppliedFor: user.trackAppliedFor,
      AdmissionNumber: user.admissionNumber,
      Status: user.status,
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(userData);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Users");

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", "attachment; filename=users.xlsx");
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(buffer);
  } catch (error) {
    console.error("Error generating Excel file:", error);
    res.status(500).json({ message: "Error generating Excel file", error });
  }
});


// Update user status (approve/decline)
app.put("/api/users/:id", async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: "Failed to update user status" });
  }
});

// Function to send email with retry
const sendEmailWithRetry = async (user, delay, retries = 3) => {
  return new Promise((resolve) => {
    setTimeout(async () => {
      const mailOptions = {
        from: `"Innovate to Impact" <${process.env.EMAIL_USER}>`,
        to: user.Email,
        subject: 'Congratulations! Next Steps for Innovate to Impact 2025 Bootcamp - Screening Test & Special Event',
        html: `
            <p>Dear <strong>${user.Name}</strong>,</p>
    
            <p>Congratulations!</p>
    
            <p>We are delighted to inform you that your application for the Innovate to Impact Bootcamp 2025 first cohort has been successful, and you have been selected to move forward to the screening phase!</p>
    
            <h3>Special Event Announcement:</h3>
            <p>Mark your calendar for <strong>February 28th, 2025</strong>! We've planned a special event just for you. Be sure to register and come prepared with your questions, as our guest is ready to equip you with everything you need to kickstart your journey in the tech industry. Don't miss out!</p>
    
            <p>Find the registration link here: <a href="https://www.classmarker.com/register/?trk=home-try-free" target="_blank">Click here to register</a></p>
    
            <h3>Screening Test Details:</h3>
            <p><strong>Test Duration:</strong><br>
            February 25th - February 26th, 2025</p>
    
            <p>Please note that you must complete the test within this timeframe. No extensions will be granted.</p>
    
            <h3>Registration Instructions:</h3>
            <ol>
                <li>Visit <a href="https://www.classmarker.com/register/?trk=home-try-free" target="_blank">ClassMarker.com</a></li>
                <li>Click on "Try It For Free"</li>
                <li>Select "Register to Take Test"</li>
                <li>Enter your Registration Code: <strong>${user.Code}</strong></li>
                <li>Complete your profile using the same email address you used in your initial application</li>
            </ol>
    
            <h3>Important Test Information:</h3>
            <ul>
                <li><strong>Duration:</strong> 30 minutes</li>
                <li><strong>Passing Score:</strong> 90%</li>
                <li>The test must be completed in one sitting - you cannot pause and return later</li>
                <li>Your registration code can only be used once</li>
                <li>Make sure to submit your test before closing your browser tab</li>
                <li>Ensure you have a stable internet connection before starting</li>
            </ul>
    
            <p>Please note that this is a crucial phase of the selection process. We recommend finding a quiet space and setting aside dedicated time to complete the assessment without interruptions.</p>
    
            <h3>Stay connected with us on social media:</h3>
            <p>
                📌 Instagram: <a href="https://www.instagram.com/innovatetoimpact_">@innovatetoimpact_</a><br>
                📌 LinkedIn: <a href="https://www.linkedin.com/company/innovate-to-impact">Innovate to Impact</a><br>
                📌 X (Twitter): <a href="https://twitter.com/Innovate2impact">@Innovate2impact</a><br>
                📌 YouTube: <a href="https://www.youtube.com/@Innovatetoimpact">Innovatetoimpact</a><br>
                📌 TikTok: <a href="https://www.tiktok.com/@Innovatetoimpact">Innovatetoimpact</a>
            </p>
    
            <p>We wish you the best of luck with your screening test!</p>
    
            <p>Best regards,<br>
            <strong>The Innovate to Impact Team</strong></p>
    
            <p><strong>Note:</strong> If you experience any technical difficulties during the test, please contact our support team immediately at <a href="mailto:innovatetoimpactglobal@gmail.com">innovatetoimpactglobal@gmail.com</a></p>
        `
      };


      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          await transporter.sendMail(mailOptions);
          console.log(`✅ Email sent to ${user.Email}`);

          await EmailLog.create({ name: user.Name, email: user.Email, code: user.Code, status: "sent" });
          resolve({ email: user.Email, status: "sent" });
          return;
        } catch (error) {
          console.error(`❌ Error sending email to ${user.Email} (Attempt ${attempt}):`, error);
          if (attempt === retries) {
            await EmailLog.create({ name: user.Name, email: user.Email, code: user.Code, status: "failed" });
            resolve({ email: user.Email, status: "failed" });
          }
        }
      }
    }, delay);
  });
};


// API to get failed emails
app.get("/failed-emails", async (req, res) => {
  try {
    const failedEmails = await EmailLog.find({ status: "failed" });
    res.json(failedEmails);
  } catch (error) {
    console.error("Error fetching failed emails:", error);
    res.status(500).json({ message: "Error fetching data" });
  }
});

// API to retry failed emails
app.post("/retry-failed", async (req, res) => {
  try {
    const failedEmails = await EmailLog.find({ status: "failed" });

    for (let user of failedEmails) {
      await sendEmailWithRetry(user, 3000);
    }

    res.json({ message: "Retry process started!" });
  } catch (error) {
    console.error("Error retrying failed emails:", error);
    res.status(500).json({ message: "Error retrying emails" });
  }
});


// SSE Endpoint to send progress updates
app.get("/progress", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  clients.push(res);

  req.on("close", () => {
    clients = clients.filter(client => client !== res);
  });
});

// Function to send updates to clients
const sendProgressUpdate = () => {
  const data = `data: ${JSON.stringify(progress)}\n\n`;
  clients.forEach(client => client.write(data));
};

// File Upload and Email Sending Route
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const users = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    progress = { sentCount: 0, totalEmails: users.length };

    for (let i = 0; i < users.length; i++) {
      await sendEmailWithRetry(users[i], 3000);
      progress.sentCount++;

      sendProgressUpdate();
    }

    res.json({ message: `${progress.totalEmails} emails have been sent!` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error processing file" });
  }
});


// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
