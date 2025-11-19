const express = require("express");
const fs = require("fs").promises; // Use promises for async/await
const path = require("path");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("crypto");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const DB_PATH = path.join(__dirname, "db.json");

// --- MIDDLEWARE SETUP ---
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/public/parts", async (req, res) => {
  console.log("Public /parts route HIT!"); // Debug: Check server console
  try {
    const db = await readDB();
    console.log("readDB success, parts count:", db.parts.length); // Debug: Should log 7
    res.json(db.parts);
  } catch (error) {
    console.error("readDB error:", error.message); // Debug: Logs if file issue
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

app.get("/api/public/jobs", async (req, res) => {
  try {
    const db = await readDB();
    console.log("readDB success for jobs, job count:", db.jobCards.length); // Debug: Should log 7
    res.json(db.jobCards);
  } catch (error) {
    console.error("readDB error:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});
app.get("/api/public/users", async (req, res) => {
  console.log("Public /users route HIT!"); // Debug
  try {
    const db = await readDB();
    console.log("readDB success for jobs, job count:", db.users.length); // Debug: Should log 7
    res.json(db.users);
  } catch (error) {
    console.error("readDB error:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// --- DB HELPER FUNCTIONS ---
async function readDB() {
  try {
    const data = await fs.readFile(DB_PATH, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading database:", error);
    throw new Error("Could not read from database.");
  }
}

async function writeDB(data) {
  try {
    await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.error("Error writing to database:", error);
    throw new Error("Could not write to database.");
  }
}

// --- AUTHENTICATION MIDDLEWARE ---
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ message: "Access denied. No token provided." });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (ex) {
    res.status(400).json({ message: "Invalid token." });
  }
};

const checkRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden." });
    }
    next();
  };
};

// --- API ROUTES ---

// 1. Auth
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const db = await readDB();
    const user = db.users.find((u) => u.username === username);

    if (!user || user.password !== password) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        fullName: user.fullName,
      },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      message: "Login successful!",
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        fullName: user.fullName,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// 2. Admin Routes
app.post(
  "/api/auth/register",
  authMiddleware,
  checkRole(["admin"]),
  async (req, res) => {
    try {
      const { username, password, fullName, mobile, role } = req.body;
      if (role === "admin")
        return res.status(403).json({ message: "Cannot register admins." });

      const db = await readDB();
      if (db.users.find((u) => u.username === username))
        return res.status(409).json({ message: "Username exists." });

      const newUser = {
        id: randomUUID(),
        username,
        password,
        fullName,
        mobile,
        role,
      };
      db.users.push(newUser);
      await writeDB(db);
      res.status(201).json({ message: "User registered.", userId: newUser.id });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  }
);

app.get(
  "/api/admin/dashboard-data",
  authMiddleware,
  checkRole(["admin"]),
  async (req, res) => {
    try {
      const db = await readDB();
      const mechanics = db.users
        .filter((u) => u.role === "mechanic")
        .map((m) => ({ id: m.id, fullName: m.fullName }));
      const jobCards = db.jobCards.map((job) => {
        const customer = db.users.find((u) => u.id === job.customerId);
        const mechanic = db.users.find((u) => u.id === job.assignedMechanicId);
        return {
          ...job,
          customerName: customer ? customer.fullName : "N/A",
          mechanicName: mechanic ? mechanic.fullName : "N/A",
        };
      });
      res.json({ jobCards, mechanics, parts: db.parts });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  }
);

app.put(
  "/api/admin/jobcards/:id/assign",
  authMiddleware,
  checkRole(["admin"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { mechanicId } = req.body;
      const db = await readDB();
      const job = db.jobCards.find((j) => j.id === id);
      if (!job) return res.status(404).json({ message: "Job not found." });

      const mechanic = db.users.find(
        (u) => u.id === mechanicId && u.role === "mechanic"
      );
      if (!mechanic)
        return res.status(404).json({ message: "Mechanic not found." });

      job.assignedMechanicId = mechanicId;
      job.status = "Assigned";
      await writeDB(db);

      res.json({ message: "Assigned.", jobCard: job });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  }
);

// --- NEW: Add Stock to Inventory ---
app.put(
  "/api/admin/inventory/:id/add",
  authMiddleware,
  checkRole(["admin"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { quantity } = req.body;
      const qtyToAdd = parseInt(quantity, 10);

      if (isNaN(qtyToAdd) || qtyToAdd <= 0) {
        return res.status(400).json({ message: "Positive quantity required." });
      }

      const db = await readDB();
      const part = db.parts.find((p) => p.id === id);

      if (!part) {
        return res.status(404).json({ message: "Part not found." });
      }

      part.quantity += qtyToAdd;
      await writeDB(db);

      res.json({ message: "Stock updated successfully.", part });
    } catch (error) {
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

app.delete(
  "/api/admin/jobcards/:id",
  authMiddleware,
  checkRole(["admin"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const db = await readDB();
      const jobIndex = db.jobCards.findIndex((j) => j.id === id);

      if (jobIndex === -1)
        return res.status(404).json({ message: "Job card not found." });

      if (db.jobCards[jobIndex].status !== "Dispatched") {
        return res
          .status(400)
          .json({ message: "Only dispatched jobs can be deleted." });
      }

      db.jobCards.splice(jobIndex, 1);
      await writeDB(db);
      res.json({ message: "Job card deleted successfully." });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  }
);

// 3. Mechanic Routes
app.get(
  "/api/inventory/parts",
  authMiddleware,
  checkRole(["mechanic", "admin"]),
  async (req, res) => {
    const db = await readDB();
    res.json(db.parts);
  }
);

app.get(
  "/api/mechanic/jobs",
  authMiddleware,
  checkRole(["mechanic"]),
  async (req, res) => {
    const db = await readDB();
    const myJobs = db.jobCards
      .filter((j) => j.assignedMechanicId === req.user.userId)
      .map((job) => {
        const customer = db.users.find((u) => u.id === job.customerId);
        return {
          ...job,
          customerName: customer ? customer.fullName : "N/A",
          customerMobile: customer ? customer.mobile : "N/A",
        };
      });
    res.json(myJobs);
  }
);

app.put(
  "/api/mechanic/jobs/:id/log-part",
  authMiddleware,
  checkRole(["mechanic"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { partId, quantityUsed } = req.body;
      const qty = parseInt(quantityUsed);
      const db = await readDB();
      const job = db.jobCards.find((j) => j.id === id);
      const part = db.parts.find((p) => p.id === partId);

      if (!job || job.assignedMechanicId !== req.user.userId)
        return res.status(403).json({ message: "Invalid job." });
      if (!part || part.quantity < qty)
        return res.status(400).json({ message: "Stock error." });

      part.quantity -= qty;
      const existingLog = job.partsUsed.find((p) => p.partId === partId);
      if (existingLog) existingLog.quantity += qty;
      else
        job.partsUsed.push({ partId, partName: part.partName, quantity: qty });

      await writeDB(db);
      res.json({ message: "Part logged.", jobCard: job });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  }
);

app.put(
  "/api/mechanic/jobs/:id/status",
  authMiddleware,
  checkRole(["mechanic"]),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const db = await readDB();
      const job = db.jobCards.find((j) => j.id === id);

      if (!job || job.assignedMechanicId !== req.user.userId)
        return res.status(403).json({ message: "Invalid job." });

      job.status = status;
      if (status === "Dispatched")
        job.dispatchedDate = new Date().toISOString();

      await writeDB(db);
      res.json({ message: "Status updated.", jobCard: job });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  }
);

// 4. Customer Routes
app.post(
  "/api/customer/request-service",
  authMiddleware,
  checkRole(["customer"]),
  async (req, res) => {
    try {
      const { vehicleNumberPlate, issueDescription } = req.body;
      const db = await readDB();
      const newJob = {
        id: randomUUID(),
        customerId: req.user.userId,
        vehicleNumberPlate,
        issueDescription,
        status: "Pending",
        assignedMechanicId: null,
        partsUsed: [],
        createdDate: new Date().toISOString(),
      };
      db.jobCards.push(newJob);
      await writeDB(db);
      res.status(201).json({ message: "Request submitted.", jobCard: newJob });
    } catch (error) {
      res.status(500).json({ message: "Server error" });
    }
  }
);

app.get(
  "/api/customer/status",
  authMiddleware,
  checkRole(["customer"]),
  async (req, res) => {
    const db = await readDB();
    const myJobs = db.jobCards
      .filter((j) => j.customerId === req.user.userId)
      .map((job) => ({
        jobId: job.id,
        vehicle: job.vehicleNumberPlate,
        issue: job.issueDescription,
        status: job.status,
        created: job.createdDate,
      }));
    res.json(myJobs);
  }
);

// --- DIRECT DB ACCESS (UNRESTRICTED) ---
app.get("/db.json/:key", async (req, res) => {
  try {
    const key = req.params.key;
    const db = await readDB();
    if (db[key]) res.json(db[key]);
    else res.status(404).json({ message: "Key not found." });
  } catch (error) {
    res.status(500).json({ message: "Error." });
  }
});

// --- ROOT & SERVER ---
app.get("/api", (req, res) => res.json({ message: "API Running" }));
app.use((req, res) =>
  res.sendFile(path.join(__dirname, "public", "index.html"))
);

app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
