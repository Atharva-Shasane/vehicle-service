// --- STATE MANAGEMENT ---
const API_BASE_URL = "http://localhost:3000/api";
let TOKEN = null;
let CURRENT_USER = null;

// --- DOM ELEMENTS ---
const loginView = document.getElementById("login-view");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");

const userInfo = document.getElementById("user-info");
const userFullname = document.getElementById("user-fullname");
const logoutButton = document.getElementById("logout-button");

const customerDashboard = document.getElementById("customer-dashboard");
const mechanicDashboard = document.getElementById("mechanic-dashboard");
const adminDashboard = document.getElementById("admin-dashboard");

const customerStatusList = document.getElementById("customer-status-list");
const customerRequestForm = document.getElementById("customer-request-form");
const customerRequestSuccess = document.getElementById(
  "customer-request-success"
);

const mechanicJobList = document.getElementById("mechanic-job-list");

// Admin Elements
const adminJobList = document.getElementById("admin-job-list");
const adminDispatchedList = document.getElementById("admin-dispatched-list");
const adminPartsList = document.getElementById("admin-parts-list");

// --- MODAL ELEMENTS (Mechanic) ---
const logPartModal = document.getElementById("log-part-modal");
const closeModalButton = document.getElementById("close-modal");
const logPartForm = document.getElementById("log-part-form");
const modalJobIdSpan = document.getElementById("modal-job-id");
const modalJobIdInput = document.getElementById("modal-job-id-input");
const partSelect = document.getElementById("part-select");
const logPartError = document.getElementById("log-part-error");

// --- MODAL ELEMENTS (Admin Stock) ---
const addStockModal = document.getElementById("add-stock-modal");
const closeStockModalBtn = document.getElementById("close-stock-modal");
const addStockForm = document.getElementById("add-stock-form");
const modalPartName = document.getElementById("modal-part-name");
const modalPartId = document.getElementById("modal-part-id");
const stockQuantityInput = document.getElementById("stock-quantity");

// --- API HELPER FUNCTION ---
async function apiRequest(endpoint, method, body = null) {
  const headers = { "Content-Type": "application/json" };
  if (TOKEN) headers["Authorization"] = `Bearer ${TOKEN}`;

  const config = { method, headers };
  if (body) config.body = JSON.stringify(body);

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.message || `HTTP error! Status: ${response.status}`
      );
    }
    if (response.status === 204) return {};
    return await response.json();
  } catch (error) {
    console.error("API Request Error:", error.message);
    throw error;
  }
}

// --- LOGIN & LOGOUT ---
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  try {
    const data = await apiRequest("/auth/login", "POST", {
      username,
      password,
    });
    TOKEN = data.token;
    CURRENT_USER = data.user;
    localStorage.setItem("token", TOKEN);
    localStorage.setItem("user", JSON.stringify(CURRENT_USER));
    showDashboard(CURRENT_USER.role);
  } catch (error) {
    loginError.textContent = `Login Failed: ${error.message}`;
  }
});

logoutButton.addEventListener("click", () => {
  TOKEN = null;
  CURRENT_USER = null;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  [customerDashboard, mechanicDashboard, adminDashboard, userInfo].forEach(
    (el) => el.classList.add("hidden")
  );
  loginView.classList.remove("hidden");
});

// --- DASHBOARD ROUTING ---
function showDashboard(role) {
  loginView.classList.add("hidden");
  [customerDashboard, mechanicDashboard, adminDashboard].forEach((el) =>
    el.classList.add("hidden")
  );
  userFullname.textContent = CURRENT_USER.fullName;
  userInfo.classList.remove("hidden");

  if (role === "customer") {
    customerDashboard.classList.remove("hidden");
    loadCustomerDashboard();
  } else if (role === "mechanic") {
    mechanicDashboard.classList.remove("hidden");
    loadMechanicDashboard();
  } else if (role === "admin") {
    adminDashboard.classList.remove("hidden");
    loadAdminDashboard();
  }
}

// --- CUSTOMER DASHBOARD ---
async function loadCustomerDashboard() {
  customerStatusList.innerHTML = "Loading...";
  try {
    const jobs = await apiRequest("/customer/status", "GET");
    if (jobs.length === 0) {
      customerStatusList.innerHTML =
        "<p>You have no active service requests.</p>";
      return;
    }
    customerStatusList.innerHTML = "";
    jobs.forEach((job) => {
      const statusClass = `status-${job.status.split(" ")[0]}`;
      customerStatusList.innerHTML += `
                <div class="job-card">
                    <h4>Vehicle: ${job.vehicle}</h4>
                    <p><strong>Issue:</strong> ${job.issue}</p>
                    <p><strong>Status:</strong> <span class="status ${statusClass}">${
        job.status
      }</span></p>
                    <p><small>Submitted: ${new Date(
                      job.created
                    ).toLocaleString()}</small></p>
                </div>
            `;
    });
  } catch (error) {
    customerStatusList.innerHTML = `<p class="error-message">Error: ${error.message}</p>`;
  }
}

customerRequestForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  customerRequestSuccess.textContent = "";
  const vehicleNumberPlate = document.getElementById("vehicle-plate").value;
  const issueDescription = document.getElementById("issue-description").value;

  try {
    await apiRequest("/customer/request-service", "POST", {
      vehicleNumberPlate,
      issueDescription,
    });
    customerRequestSuccess.textContent =
      "Service request submitted successfully!";
    customerRequestForm.reset();
    loadCustomerDashboard();
  } catch (error) {
    customerRequestSuccess.textContent = `Error: ${error.message}`;
  }
});

// --- MECHANIC DASHBOARD ---
async function loadMechanicDashboard() {
  mechanicJobList.innerHTML = "Loading...";
  try {
    const [jobs, parts] = await Promise.all([
      apiRequest("/mechanic/jobs", "GET"),
      apiRequest("/inventory/parts", "GET"),
    ]);

    partSelect.innerHTML = parts
      .map(
        (p) =>
          `<option value="${p.id}">${p.partName} (In Stock: ${p.quantity})</option>`
      )
      .join("");

    if (jobs.length === 0) {
      mechanicJobList.innerHTML = "<p>You have no assigned jobs.</p>";
      return;
    }

    mechanicJobList.innerHTML = "";
    jobs.forEach((job) => {
      mechanicJobList.appendChild(createMechanicJobCard(job));
    });
  } catch (error) {
    mechanicJobList.innerHTML = `<p class="error-message">Error: ${error.message}</p>`;
  }
}

function createMechanicJobCard(job) {
  const card = document.createElement("div");
  card.className = "job-card";
  const statusClass = `status-${job.status.split(" ")[0]}`;

  card.innerHTML = `
        <h4>Vehicle: ${job.vehicleNumberPlate} (Job ID: ${job.id})</h4>
        <p><strong>Customer:</strong> ${job.customerName} (${
    job.customerMobile
  })</p>
        <p><strong>Issue:</strong> ${job.issueDescription}</p>
        <p><strong>Status:</strong> <span class="status ${statusClass}">${
    job.status
  }</span></p>
        <div class="parts-log">
            <strong>Parts Used:</strong>
            <ul>${
              job.partsUsed.length > 0
                ? job.partsUsed
                    .map((p) => `<li>${p.quantity} x ${p.partName}</li>`)
                    .join("")
                : "<li>None</li>"
            }</ul>
        </div>
        <div class="job-actions">
            <select class="update-status-select" data-job-id="${job.id}">
                <option value="">-- Update Status --</option>
                <option value="In Progress" ${
                  job.status === "In Progress" ? "selected" : ""
                }>In Progress</option>
                <option value="Ready for Dispatch" ${
                  job.status === "Ready for Dispatch" ? "selected" : ""
                }>Ready for Dispatch</option>
                <option value="Dispatched" ${
                  job.status === "Dispatched" ? "selected" : ""
                }>Dispatched</option>
            </select>
            <button class="log-part-button secondary" data-job-id="${
              job.id
            }">Log Part</button>
        </div>
    `;

  card
    .querySelector(".update-status-select")
    .addEventListener("change", async (e) => {
      const newStatus = e.target.value;
      if (!newStatus) return;
      try {
        await apiRequest(`/mechanic/jobs/${job.id}/status`, "PUT", {
          status: newStatus,
        });
        loadMechanicDashboard();
      } catch (error) {
        alert(`Error: ${error.message}`);
      }
    });

  card
    .querySelector(".log-part-button")
    .addEventListener("click", () => openLogPartModal(job.id));
  return card;
}

function openLogPartModal(jobId) {
  modalJobIdSpan.textContent = jobId;
  modalJobIdInput.value = jobId;
  logPartError.textContent = "";
  logPartModal.classList.remove("hidden");
}

closeModalButton.addEventListener("click", () =>
  logPartModal.classList.add("hidden")
);

logPartForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  logPartError.textContent = "";
  const jobId = modalJobIdInput.value;
  const partId = document.getElementById("part-select").value;
  const quantityUsed = document.getElementById("part-quantity").value;

  try {
    await apiRequest(`/mechanic/jobs/${jobId}/log-part`, "PUT", {
      partId,
      quantityUsed,
    });
    logPartModal.classList.add("hidden");
    loadMechanicDashboard();
  } catch (error) {
    logPartError.textContent = `Error: ${error.message}`;
  }
});

// --- ADMIN DASHBOARD ---
let adminData = { jobs: [], mechanics: [], parts: [] };

async function loadAdminDashboard() {
  adminJobList.innerHTML = "Loading...";
  adminDispatchedList.innerHTML = "Loading...";
  adminPartsList.innerHTML = "Loading...";

  try {
    const data = await apiRequest("/admin/dashboard-data", "GET");
    adminData.jobs = data.jobCards;
    adminData.mechanics = data.mechanics;
    adminData.parts = data.parts;

    adminJobList.innerHTML = "";
    adminDispatchedList.innerHTML = "";

    // Jobs Rendering
    if (adminData.jobs.length === 0) {
      adminJobList.innerHTML = "<p>No job cards found.</p>";
    } else {
      const activeJobs = adminData.jobs.filter(
        (job) => job.status !== "Dispatched"
      );
      const dispatchedJobs = adminData.jobs.filter(
        (job) => job.status === "Dispatched"
      );

      if (activeJobs.length === 0)
        adminJobList.innerHTML = "<p>No active jobs.</p>";
      activeJobs.forEach((job) =>
        adminJobList.appendChild(createAdminJobCard(job))
      );

      if (dispatchedJobs.length === 0)
        adminDispatchedList.innerHTML = "<p>No dispatched history.</p>";
      dispatchedJobs.forEach((job) =>
        adminDispatchedList.appendChild(createAdminJobCard(job))
      );
    }

    // Render Inventory with Add Stock Button
    if (adminData.parts.length === 0) {
      adminPartsList.innerHTML = "<p>No parts in inventory.</p>";
    } else {
      adminPartsList.innerHTML = "";
      const ul = document.createElement("ul");
      adminData.parts.forEach((part) => {
        const li = document.createElement("li");
        li.innerHTML = `
            <span><strong>${part.partName}</strong>: ${part.quantity} in stock</span>
            <button class="btn-small" data-id="${part.id}" data-name="${part.partName}">Add Stock</button>
        `;
        // Add Event Listener to the button
        li.querySelector("button").addEventListener("click", () =>
          openAddStockModal(part)
        );
        ul.appendChild(li);
      });
      adminPartsList.appendChild(ul);
    }
  } catch (error) {
    adminJobList.innerHTML = `<p class="error-message">Error: ${error.message}</p>`;
  }
}

function createAdminJobCard(job) {
  const card = document.createElement("div");
  card.className = "job-card";
  const statusClass = `status-${job.status.split(" ")[0]}`;
  const isDispatched = job.status === "Dispatched";

  let actionHTML = "";
  if (isDispatched) {
    actionHTML = `
        <div class="job-actions" style="justify-content: flex-end;">
            <button class="btn-danger delete-job-btn" data-id="${job.id}">Delete Record</button>
        </div>`;
  } else {
    const mechanicOptions = adminData.mechanics
      .map(
        (m) =>
          `<option value="${m.id}" ${
            job.assignedMechanicId === m.id ? "selected" : ""
          }>${m.fullName}</option>`
      )
      .join("");

    actionHTML = `
        <div class="job-actions">
            <label for="assign-mech-${job.id}">Assign Mechanic:</label>
            <select id="assign-mech-${job.id}" class="assign-mechanic-select" data-job-id="${job.id}">
                <option value="">-- Unassigned --</option>
                ${mechanicOptions}
            </select>
        </div>`;
  }

  card.innerHTML = `
        <h4>Vehicle: ${job.vehicleNumberPlate}</h4>
        <p><strong>Job ID:</strong> <small>${job.id}</small></p>
        <p><strong>Customer:</strong> ${job.customerName}</p>
        <p><strong>Mechanic:</strong> ${
          isDispatched
            ? job.mechanicName || "Completed"
            : job.mechanicName || "Pending"
        }</p>
        <p><strong>Issue:</strong> ${job.issueDescription}</p>
        <p><strong>Status:</strong> <span class="status ${statusClass}">${
    job.status
  }</span></p>
        <div class="parts-log">
            <strong>Parts Used:</strong>
            <ul>${
              job.partsUsed.length > 0
                ? job.partsUsed
                    .map((p) => `<li>${p.quantity} x ${p.partName}</li>`)
                    .join("")
                : "<li>None</li>"
            }</ul>
        </div>
        ${actionHTML}
    `;

  if (isDispatched) {
    card
      .querySelector(".delete-job-btn")
      .addEventListener("click", async () => {
        if (
          confirm("Are you sure you want to permanently delete this record?")
        ) {
          try {
            await apiRequest(`/admin/jobcards/${job.id}`, "DELETE");
            loadAdminDashboard();
          } catch (error) {
            alert(`Error deleting: ${error.message}`);
          }
        }
      });
  } else {
    card
      .querySelector(".assign-mechanic-select")
      .addEventListener("change", async (e) => {
        const mechanicId = e.target.value;
        if (!mechanicId) return;
        try {
          await apiRequest(`/admin/jobcards/${job.id}/assign`, "PUT", {
            mechanicId,
          });
          loadAdminDashboard();
        } catch (error) {
          alert(`Error assigning: ${error.message}`);
        }
      });
  }

  return card;
}

// --- ADMIN STOCK MODAL LOGIC ---
function openAddStockModal(part) {
  modalPartName.textContent = part.partName;
  modalPartId.value = part.id;
  stockQuantityInput.value = 10; // Default value
  addStockModal.classList.remove("hidden");
}

closeStockModalBtn.addEventListener("click", () => {
  addStockModal.classList.add("hidden");
});

addStockForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const partId = modalPartId.value;
  const quantity = stockQuantityInput.value;

  try {
    await apiRequest(`/admin/inventory/${partId}/add`, "PUT", { quantity });
    addStockModal.classList.add("hidden");
    loadAdminDashboard(); // Refresh inventory list
  } catch (error) {
    alert(`Error updating stock: ${error.message}`);
  }
});

// --- INITIAL APP LOAD ---
function initApp() {
  const storedToken = localStorage.getItem("token");
  const storedUser = localStorage.getItem("user");
  if (storedToken && storedUser) {
    TOKEN = storedToken;
    CURRENT_USER = JSON.parse(storedUser);
    showDashboard(CURRENT_USER.role);
  } else {
    loginView.classList.remove("hidden");
  }
}

initApp();
