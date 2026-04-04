# 🧠 HR Attendance Management System

A production-ready HR Attendance Management System designed to handle real-world workforce tracking scenarios, including multi-session attendance, manual productivity tracking, and advanced business logic.

---

## 🚀 Overview

This system enables organizations to track employee attendance, manage working hours, and calculate productivity metrics with flexibility and accuracy.

It goes beyond basic check-in/check-out systems by supporting:

* Multi-session attendance per day
* Manual "Actual Hours" tracking
* Smart calculation of Remaining & Overtime
* Role-based access control (Employee / Admin / Product Owner)
* Auto check-out mechanism
* Real-time dashboard and filtering

---

## 🏗️ Core Features

### 🔐 Authentication

* Secure login using email & password
* Remember Me functionality
* Role-based access system

---

### 👥 Employee Management

* Add / manage employees
* Assign position (e.g., Product Owner, Employee)
* Role-based permissions

---

### 🕒 Attendance System

#### ✅ Standard Flow

* Check-In
* Check-Out
* Pause

#### 🔁 Multi-Session Support

Employees can:

* Check in/out multiple times per day
* Handle urgent work outside normal hours

Example:

* Session 1 → 9:00 AM – 5:00 PM
* Session 2 → 8:00 PM – 10:00 PM

👉 Total attendance = sum of all sessions

---

### 🧮 Actual Hours (Product Owner Feature)

* Entered manually by Product Owner (PO)
* Represents actual productive work time
* Can be:

  * Less than attendance
  * Equal
  * Greater (overtime work)

---

### 📊 Smart Calculations

All calculations are based on **Expected Working Hours (default = 8h/day)**

#### ✔ Remaining Hours

```
Remaining = Expected - Actual
```

#### ✔ Overtime

```
Overtime = Actual - Expected (if positive)
```

#### ✔ Attendance Hours

```
Total = sum of all sessions per day
```

---

### 📅 Monthly Summary

Displays:

* Total Worked Hours
* Total Overtime
* Total Missing (Remaining)

> ⚠️ Efficiency was removed for simplicity and clarity.

---

### 🔍 Filtering

* Filter by date / month
* All summary calculations dynamically update based on filtered data

---

### ⚙️ Settings

* Configure:

  * Work start time
  * Grace period
  * Auto check-out time

---

### ⏱️ Auto Check-Out

Automatically closes open sessions when:

```
Current Time ≥ Auto Check-out Time
```

Prevents:

* Open sessions overnight
* Incorrect attendance data

---

## 🧠 Business Logic Highlights

### ✔ Separation of Concerns

* Attendance = presence tracking
* Actual Hours = productivity tracking

---

### ✔ Correct Calculation Model

All productivity metrics depend on:

```
Actual vs Expected (NOT Attendance)
```

---

### ✔ Multi-Session Aggregation

* All sessions are combined per day
* Fully reflected in calculations and UI

---

### ✔ Role System

| Role          | Permissions                                          |
| ------------- | ---------------------------------------------------- |
| Employee      | Check-in/out, view own data                          |
| Product Owner | Employee + full dashboard access + edit Actual Hours |
| Admin / HR    | Full system access                                   |

---

## 🖥️ UI/UX Highlights

* Clean dashboard design
* Sessions displayed vertically for clarity
* Totals clearly separated
* Responsive layout

---

## 🧪 Testing & Validation

The system includes full validation of:

* Authentication
* Role permissions
* Multi-session behavior
* Actual vs Expected calculations
* Filtering logic
* Auto check-out
* Settings stability

All tests ensure:

* No regression bugs
* No data loss
* Stable production behavior

---

## ⚠️ Edge Cases Handled

* Missing check-out
* Multiple sessions in one day
* Actual hours greater than expected
* No data scenarios
* Filtering with empty results

---

## 🛡️ Stability & Data Safety

* Backward compatible (old data still works)
* Non-destructive updates
* No database reset required
* Safe enhancements only

---

## 📌 Future Enhancements (Optional)

* Overtime approval workflow
* Task-based actual hours tracking
* Advanced analytics dashboard
* Notifications & alerts
* Automation testing integration

---

## 💡 Conclusion

This system is designed with real-world HR needs in mind, combining:

* Accurate attendance tracking
* Flexible work scenarios
* Strong business logic
* Scalable architecture

It reflects production-level thinking and is suitable for enterprise environments.

---

## 👨‍💻 Author

Mohamed Omar
Technical Product Owner | ABG Egypt
