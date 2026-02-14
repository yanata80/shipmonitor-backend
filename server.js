const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');

dotenv.config();
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kapal-monitoring', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// ===================== SCHEMAS =====================

// Kapal Schema
const kapalSchema = new mongoose.Schema({
  nama: String,
  jenis: String, // ferry, speedboat, dll
  kapasitas: Number,
  tahunBuat: Number,
  panjang: Number,
  lebar: Number,
  draft: Number,
  kecepatan: Number,
  mesin: [{
    nomorMesin: String,
    tipe: String,
    daya: Number,
    kapasitasBahan: Number
  }],
  port: String,
  status: { type: String, default: 'aktif' }, // aktif, nonaktif, maintenance
  createdAt: { type: Date, default: Date.now }
});

// Port Schema
const portSchema = new mongoose.Schema({
  nama: String,
  negara: String,
  lokasi: String,
  fasilitas: [String],
  createdAt: { type: Date, default: Date.now }
});

// Monitoring Report Schema
const monitoringSchema = new mongoose.Schema({
  kapal: mongoose.Schema.Types.ObjectId,
  kapalNama: String,
  tanggal: Date,
  jam: String,
  rute: String,
  speed: Number,
  cuaca: String,
  arus: String,
  penumpang: Number,
  mesin: [{
    nomorMesin: String,
    rpm: Number,
    coolantTemp: Number,
    turboPress: Number,
    engineOilPress: Number,
    transOilTemp: Number,
    transOilPress: Number,
    exhaustTemp: Number,
    batteryVoltage: Number,
    rateBbm: Number,
    fuelPressure: Number,
    runningHour: Number
  }],
  status: String, // normal, warning, critical
  createdAt: { type: Date, default: Date.now }
});

// Order Supply Schema
const orderSchema = new mongoose.Schema({
  kapal: mongoose.Schema.Types.ObjectId,
  kapalNama: String,
  items: [{
    nama: String,
    jumlah: Number,
    unit: String,
    harga: Number
  }],
  totalHarga: Number,
  prioritas: { type: String, default: 'normal' }, // urgent, normal, low
  status: { type: String, default: 'pending' }, // pending, approved, in_transit, delivered
  requestedBy: String,
  approvedBy: String,
  assignedTo: String,
  whatsappNumber: String,
  notificationStatus: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// User Schema
const userSchema = new mongoose.Schema({
  nama: String,
  email: String,
  role: { type: String, enum: ['admin', 'manager', 'crew'] },
  whatsappNumber: String,
  kapal: mongoose.Schema.Types.ObjectId,
  createdAt: { type: Date, default: Date.now }
});

// Models
const Kapal = mongoose.model('Kapal', kapalSchema);
const Port = mongoose.model('Port', portSchema);
const Monitoring = mongoose.model('Monitoring', monitoringSchema);
const Order = mongoose.model('Order', orderSchema);
const User = mongoose.model('User', userSchema);

// ===================== FONNTE WHATSAPP INTEGRATION =====================

const sendWhatsAppNotification = async (phoneNumber, message) => {
  try {
    const response = await axios.post('https://api.fonnte.com/send', {
      target: phoneNumber,
      message: message,
      countryCode: '62' // Indonesia
    }, {
      headers: {
        Authorization: process.env.FONNTE_API_KEY || 'your-fonnte-key-here'
      }
    });
    return response.data;
  } catch (error) {
    console.error('Fonnte Error:', error.message);
    throw error;
  }
};

// ===================== KAPAL ROUTES =====================

// Create Kapal
app.post('/api/kapal', async (req, res) => {
  try {
    const kapal = new Kapal(req.body);
    await kapal.save();
    res.status(201).json({ success: true, data: kapal });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Get All Kapal
app.get('/api/kapal', async (req, res) => {
  try {
    const kapal = await Kapal.find();
    res.json({ success: true, data: kapal });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Single Kapal
app.get('/api/kapal/:id', async (req, res) => {
  try {
    const kapal = await Kapal.findById(req.params.id);
    res.json({ success: true, data: kapal });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update Kapal
app.put('/api/kapal/:id', async (req, res) => {
  try {
    const kapal = await Kapal.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, data: kapal });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete Kapal
app.delete('/api/kapal/:id', async (req, res) => {
  try {
    await Kapal.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Kapal deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================== PORT ROUTES =====================

app.post('/api/port', async (req, res) => {
  try {
    const port = new Port(req.body);
    await port.save();
    res.status(201).json({ success: true, data: port });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/port', async (req, res) => {
  try {
    const ports = await Port.find();
    res.json({ success: true, data: ports });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================== MONITORING ROUTES =====================

// Create Monitoring Report
app.post('/api/monitoring', async (req, res) => {
  try {
    const monitoring = new Monitoring(req.body);
    await monitoring.save();
    
    // Check for critical values and send alerts
    const criticalAlerts = checkCriticalValues(monitoring);
    if (criticalAlerts.length > 0) {
      const managers = await User.find({ role: 'manager', kapal: monitoring.kapal });
      for (let manager of managers) {
        const alertMessage = `🚨 ALERT - ${monitoring.kapalNama}\n${criticalAlerts.join('\n')}`;
        await sendWhatsAppNotification(manager.whatsappNumber, alertMessage);
      }
    }
    
    res.status(201).json({ success: true, data: monitoring });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Get Monitoring Reports
app.get('/api/monitoring', async (req, res) => {
  try {
    const { kapalId, limit = 50 } = req.query;
    const query = kapalId ? { kapal: kapalId } : {};
    const monitoring = await Monitoring.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    res.json({ success: true, data: monitoring });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get Latest Monitoring for Kapal
app.get('/api/monitoring/latest/:kapalId', async (req, res) => {
  try {
    const monitoring = await Monitoring.findOne({ kapal: req.params.kapalId })
      .sort({ createdAt: -1 });
    res.json({ success: true, data: monitoring });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================== ORDER ROUTES =====================

// Create Order
app.post('/api/order', async (req, res) => {
  try {
    const order = new Order(req.body);
    await order.save();
    
    // Send notification to manager
    const manager = await User.findById(req.body.assignedTo);
    if (manager) {
      const message = `📦 NEW ORDER\nKapal: ${order.kapalNama}\nTotal: Rp ${order.totalHarga.toLocaleString('id-ID')}\nStatus: Pending Approval\nPrioritas: ${order.prioritas.toUpperCase()}`;
      await sendWhatsAppNotification(manager.whatsappNumber, message);
    }
    
    res.status(201).json({ success: true, data: order });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Get Orders
app.get('/api/order', async (req, res) => {
  try {
    const { kapalId, status } = req.query;
    let query = {};
    if (kapalId) query.kapal = kapalId;
    if (status) query.status = status;
    
    const orders = await Order.find(query).sort({ createdAt: -1 });
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update Order Status
app.put('/api/order/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(req.params.id, { status, updatedAt: Date.now() }, { new: true });
    
    // Send status update notification
    const message = `✅ ORDER UPDATE - ${order.kapalNama}\nStatus: ${status.toUpperCase()}\nTotal: Rp ${order.totalHarga.toLocaleString('id-ID')}`;
    if (order.whatsappNumber) {
      await sendWhatsAppNotification(order.whatsappNumber, message);
    }
    
    res.json({ success: true, data: order });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================== USER ROUTES =====================

app.post('/api/user', async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.get('/api/user', async (req, res) => {
  try {
    const users = await User.find();
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================== HELPER FUNCTIONS =====================

function checkCriticalValues(monitoring) {
  const alerts = [];
  
  monitoring.mesin.forEach(mesin => {
    if (mesin.coolantTemp > 95) alerts.push(`⚠️ ME${mesin.nomorMesin}: Coolant temperature CRITICAL (${mesin.coolantTemp}°C)`);
    if (mesin.engineOilPress < 300) alerts.push(`⚠️ ME${mesin.nomorMesin}: Engine Oil Pressure LOW (${mesin.engineOilPress} kPa)`);
    if (mesin.exhaustTemp > 420) alerts.push(`⚠️ ME${mesin.nomorMesin}: Exhaust Temperature CRITICAL (${mesin.exhaustTemp}°C)`);
    if (mesin.batteryVoltage < 24) alerts.push(`⚠️ ME${mesin.nomorMesin}: Battery Voltage LOW (${mesin.batteryVoltage}V)`);
  });
  
  return alerts;
}

// ===================== SERVER =====================

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚢 Server running on port ${PORT}`);
});

module.exports = { app, Kapal, Port, Monitoring, Order, User };
