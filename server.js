const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'az-poc-secret-change-in-prod';
const MOCK_OTP = process.env.MOCK_OTP || '111111';
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

app.use(cors());
app.use(express.json());
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ─── Logging ──────────────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// ─── In-memory state ──────────────────────────────────────────────────────────

// Agents: phone → agent object
const agents = {
  '+919999999999': { id: 'ag_01', name: 'Ravi K.',    phone: '+919999999999', fcm_token: null },
  '+919876543210': { id: 'ag_02', name: 'Suresh M.',  phone: '+919876543210', fcm_token: null },
  '+919845001234': { id: 'ag_03', name: 'Arjun P.',   phone: '+919845001234', fcm_token: null },
  '+919731009876': { id: 'ag_04', name: 'Kiran B.',   phone: '+919731009876', fcm_token: null },
};

// Location cache: agent_id → { lat, lng, bearing, accuracy, reported_at }
const locationCache = {
  'ag_01': { lat: 12.9335, lng: 77.6215, bearing: 120, accuracy: 15, reported_at: new Date().toISOString() },
};

// Orders: order_id → order object (mutable — status transitions happen here)
const orders = {
  'FC041': {
    order_id: 'FC041',
    assigned_agent_id: 'ag_01',
    order_status: 'assigned',
    patient_name: 'Meera T.',
    patient_phone: '+919812345678',
    delivery_address: { full: 'Plot 7, 2nd Cross, Koramangala 5th Block, Bangalore 560095', lat: 12.9352, lng: 77.6245 },
    delivery_area: 'Koramangala',
    items: [{ name: 'Metformin 500 mg', quantity: 60 }, { name: 'Glimepiride 2 mg', quantity: 30 }],
    distance_km: 3.4,
    stage_dates: { placed: { date: '12 May', time: '09:30' }, dispensed: { date: '12 May', time: '10:45' } },
    assigned_at: '2026-05-12T11:00:00+05:30',
    out_for_delivery_at: null,
    delivered_at: null,
    proof_photo_url: null,
  },
  'FC042': {
    order_id: 'FC042',
    assigned_agent_id: 'ag_01',
    order_status: 'out_for_delivery',
    patient_name: 'Anita S.',
    patient_phone: '+919876500001',
    delivery_address: { full: 'Flat 4B, 12th Main, Indiranagar, Bangalore 560038', lat: 12.9279, lng: 77.6271 },
    delivery_area: 'Indiranagar',
    items: [{ name: 'Metformin 500 mg', quantity: 30 }, { name: 'Atorvastatin 10 mg', quantity: 30 }, { name: 'Telmisartan 40 mg', quantity: 30 }],
    distance_km: 2.1,
    stage_dates: {
      placed: { date: '12 May', time: '10:14' },
      dispensed: { date: '12 May', time: '11:02' },
      out_for_delivery: { date: '12 May', time: '16:08' },
    },
    assigned_at: '2026-05-12T15:30:00+05:30',
    out_for_delivery_at: '2026-05-12T16:08:00+05:30',
    delivered_at: null,
    proof_photo_url: null,
  },
  'FC039': {
    order_id: 'FC039',
    assigned_agent_id: 'ag_01',
    order_status: 'delivered',
    patient_name: 'Pranav R.',
    patient_phone: '+919898765432',
    delivery_address: { full: '12, 27th Main, HSR Layout Sector 2, Bangalore 560102', lat: 12.9116, lng: 77.6389 },
    delivery_area: 'HSR Layout',
    items: [{ name: 'Amlodipine 5 mg', quantity: 30 }, { name: 'Losartan 50 mg', quantity: 30 }],
    distance_km: 5.7,
    stage_dates: {
      placed: { date: '12 May', time: '08:00' },
      dispensed: { date: '12 May', time: '09:15' },
      out_for_delivery: { date: '12 May', time: '14:20' },
      delivered: { date: '12 May', time: '15:42' },
    },
    assigned_at: '2026-05-12T13:00:00+05:30',
    out_for_delivery_at: '2026-05-12T14:20:00+05:30',
    delivered_at: '2026-05-12T15:42:00+05:30',
    proof_photo_url: 'https://picsum.photos/seed/proof1/400/300',
  },

  // ── Agent 01 extra orders ─────────────────────────────────────────────────

  'FC051': {
    order_id: 'FC051',
    assigned_agent_id: 'ag_01',
    order_status: 'assigned',
    patient_name: 'Divya S.',
    patient_phone: '+919901112233',
    delivery_address: { full: '14, 3rd Cross, Jayanagar 3rd Block, Bangalore 560011', lat: 12.9302, lng: 77.5933 },
    delivery_area: 'Jayanagar',
    items: [{ name: 'Pantoprazole 40 mg', quantity: 30 }, { name: 'Domperidone 10 mg', quantity: 30 }],
    distance_km: 4.8,
    stage_dates: { placed: { date: '18 May', time: '08:10' }, dispensed: { date: '18 May', time: '09:45' } },
    assigned_at: '2026-05-18T10:00:00+05:30',
    out_for_delivery_at: null,
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC052': {
    order_id: 'FC052',
    assigned_agent_id: 'ag_01',
    order_status: 'delivered',
    patient_name: 'Sunita V.',
    patient_phone: '+919765432109',
    delivery_address: { full: '8th Cross, Sadashivanagar, Bangalore 560080', lat: 13.0056, lng: 77.5731 },
    delivery_area: 'Sadashivanagar',
    items: [{ name: 'Levothyroxine 50 mcg', quantity: 60 }],
    distance_km: 6.1,
    stage_dates: {
      placed: { date: '18 May', time: '07:30' },
      dispensed: { date: '18 May', time: '08:45' },
      out_for_delivery: { date: '18 May', time: '10:30' },
      delivered: { date: '18 May', time: '11:20' },
    },
    assigned_at: '2026-05-18T10:00:00+05:30',
    out_for_delivery_at: '2026-05-18T10:30:00+05:30',
    delivered_at: '2026-05-18T11:20:00+05:30',
    proof_photo_url: 'https://picsum.photos/seed/proof2/400/300',
  },

  // ── Agent 02 orders ───────────────────────────────────────────────────────

  'FC053': {
    order_id: 'FC053',
    assigned_agent_id: 'ag_02',
    order_status: 'out_for_delivery',
    patient_name: 'Ramesh G.',
    patient_phone: '+919880001122',
    delivery_address: { full: '22, 5th Main, Malleshwaram, Bangalore 560003', lat: 13.0035, lng: 77.5710 },
    delivery_area: 'Malleshwaram',
    items: [{ name: 'Aspirin 75 mg', quantity: 30 }, { name: 'Clopidogrel 75 mg', quantity: 30 }, { name: 'Rosuvastatin 10 mg', quantity: 30 }],
    distance_km: 1.8,
    stage_dates: {
      placed: { date: '18 May', time: '09:00' },
      dispensed: { date: '18 May', time: '10:15' },
      out_for_delivery: { date: '18 May', time: '11:45' },
    },
    assigned_at: '2026-05-18T11:00:00+05:30',
    out_for_delivery_at: '2026-05-18T11:45:00+05:30',
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC054': {
    order_id: 'FC054',
    assigned_agent_id: 'ag_02',
    order_status: 'assigned',
    patient_name: 'Kavitha N.',
    patient_phone: '+919844556677',
    delivery_address: { full: 'No. 5, 1st Main, Rajajinagar, Bangalore 560010', lat: 12.9915, lng: 77.5521 },
    delivery_area: 'Rajajinagar',
    items: [{ name: 'Metformin 1000 mg', quantity: 60 }, { name: 'Sitagliptin 50 mg', quantity: 30 }],
    distance_km: 2.9,
    stage_dates: { placed: { date: '18 May', time: '10:00' }, dispensed: { date: '18 May', time: '11:30' } },
    assigned_at: '2026-05-18T12:00:00+05:30',
    out_for_delivery_at: null,
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC055': {
    order_id: 'FC055',
    assigned_agent_id: 'ag_02',
    order_status: 'delivered',
    patient_name: 'Harish B.',
    patient_phone: '+919611223344',
    delivery_address: { full: '3rd Floor, 9th Cross, Basavanagudi, Bangalore 560004', lat: 12.9423, lng: 77.5737 },
    delivery_area: 'Basavanagudi',
    items: [{ name: 'Amlodipine 5 mg', quantity: 30 }, { name: 'Atenolol 50 mg', quantity: 30 }],
    distance_km: 3.3,
    stage_dates: {
      placed: { date: '18 May', time: '07:00' },
      dispensed: { date: '18 May', time: '08:00' },
      out_for_delivery: { date: '18 May', time: '09:00' },
      delivered: { date: '18 May', time: '09:55' },
    },
    assigned_at: '2026-05-18T08:30:00+05:30',
    out_for_delivery_at: '2026-05-18T09:00:00+05:30',
    delivered_at: '2026-05-18T09:55:00+05:30',
    proof_photo_url: 'https://picsum.photos/seed/proof3/400/300',
  },

  // ── Agent 03 orders ───────────────────────────────────────────────────────

  'FC056': {
    order_id: 'FC056',
    assigned_agent_id: 'ag_03',
    order_status: 'out_for_delivery',
    patient_name: 'Lakshmi P.',
    patient_phone: '+919722334455',
    delivery_address: { full: 'Block B, Whitefield Main Road, Bangalore 560066', lat: 12.9698, lng: 77.7499 },
    delivery_area: 'Whitefield',
    items: [{ name: 'Gabapentin 300 mg', quantity: 60 }, { name: 'Pregabalin 75 mg', quantity: 30 }],
    distance_km: 5.2,
    stage_dates: {
      placed: { date: '18 May', time: '08:30' },
      dispensed: { date: '18 May', time: '09:50' },
      out_for_delivery: { date: '18 May', time: '11:10' },
    },
    assigned_at: '2026-05-18T10:45:00+05:30',
    out_for_delivery_at: '2026-05-18T11:10:00+05:30',
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC057': {
    order_id: 'FC057',
    assigned_agent_id: 'ag_03',
    order_status: 'assigned',
    patient_name: 'Venkat R.',
    patient_phone: '+919533221100',
    delivery_address: { full: '17, 2nd Stage, Marathahalli, Bangalore 560037', lat: 12.9591, lng: 77.6974 },
    delivery_area: 'Marathahalli',
    items: [{ name: 'Olmesartan 20 mg', quantity: 30 }, { name: 'Hydrochlorothiazide 12.5 mg', quantity: 30 }, { name: 'Aspirin 75 mg', quantity: 30 }],
    distance_km: 3.7,
    stage_dates: { placed: { date: '18 May', time: '09:15' }, dispensed: { date: '18 May', time: '10:30' } },
    assigned_at: '2026-05-18T11:15:00+05:30',
    out_for_delivery_at: null,
    delivered_at: null,
    proof_photo_url: null,
  },

  // ── Agent 04 orders ───────────────────────────────────────────────────────

  'FC058': {
    order_id: 'FC058',
    assigned_agent_id: 'ag_04',
    order_status: 'assigned',
    patient_name: 'Priya M.',
    patient_phone: '+919444556677',
    delivery_address: { full: '4th Cross, Electronic City Phase 1, Bangalore 560100', lat: 12.8458, lng: 77.6714 },
    delivery_area: 'Electronic City',
    items: [{ name: 'Metformin 500 mg', quantity: 90 }, { name: 'Glipizide 5 mg', quantity: 30 }],
    distance_km: 7.4,
    stage_dates: { placed: { date: '18 May', time: '10:30' }, dispensed: { date: '18 May', time: '12:00' } },
    assigned_at: '2026-05-18T12:30:00+05:30',
    out_for_delivery_at: null,
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC059': {
    order_id: 'FC059',
    assigned_agent_id: 'ag_04',
    order_status: 'out_for_delivery',
    patient_name: 'Mohan D.',
    patient_phone: '+919355667788',
    delivery_address: { full: '7th Main, JP Nagar 2nd Phase, Bangalore 560078', lat: 12.9065, lng: 77.5908 },
    delivery_area: 'JP Nagar',
    items: [{ name: 'Warfarin 5 mg', quantity: 30 }, { name: 'Atorvastatin 20 mg', quantity: 30 }],
    distance_km: 2.6,
    stage_dates: {
      placed: { date: '18 May', time: '08:45' },
      dispensed: { date: '18 May', time: '10:00' },
      out_for_delivery: { date: '18 May', time: '11:30' },
    },
    assigned_at: '2026-05-18T11:00:00+05:30',
    out_for_delivery_at: '2026-05-18T11:30:00+05:30',
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC060': {
    order_id: 'FC060',
    assigned_agent_id: 'ag_04',
    order_status: 'delivered',
    patient_name: 'Usha K.',
    patient_phone: '+919266778899',
    delivery_address: { full: '22nd Cross, BTM Layout 2nd Stage, Bangalore 560076', lat: 12.9166, lng: 77.6101 },
    delivery_area: 'BTM Layout',
    items: [{ name: 'Calcium + Vitamin D3', quantity: 60 }, { name: 'Ferrous Sulphate 325 mg', quantity: 30 }],
    distance_km: 4.1,
    stage_dates: {
      placed: { date: '18 May', time: '07:15' },
      dispensed: { date: '18 May', time: '08:30' },
      out_for_delivery: { date: '18 May', time: '09:45' },
      delivered: { date: '18 May', time: '10:40' },
    },
    assigned_at: '2026-05-18T09:00:00+05:30',
    out_for_delivery_at: '2026-05-18T09:45:00+05:30',
    delivered_at: '2026-05-18T10:40:00+05:30',
    proof_photo_url: 'https://picsum.photos/seed/proof4/400/300',
  },

  // ── Agent 01 extra orders (batch 2) ───────────────────────────────────────

  'FC061': {
    order_id: 'FC061',
    assigned_agent_id: 'ag_01',
    order_status: 'assigned',
    patient_name: 'Farhan A.',
    patient_phone: '+919845112233',
    delivery_address: { full: '9th Cross, Kammanahalli, Bangalore 560084', lat: 13.0122, lng: 77.6365 },
    delivery_area: 'Kammanahalli',
    items: [{ name: 'Azithromycin 500 mg', quantity: 5 }, { name: 'Cetirizine 10 mg', quantity: 10 }],
    distance_km: 4.3,
    stage_dates: { placed: { date: '19 May', time: '08:20' }, dispensed: { date: '19 May', time: '09:35' } },
    assigned_at: '2026-05-19T10:00:00+05:30',
    out_for_delivery_at: null,
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC062': {
    order_id: 'FC062',
    assigned_agent_id: 'ag_01',
    order_status: 'out_for_delivery',
    patient_name: 'Geeta R.',
    patient_phone: '+919901223344',
    delivery_address: { full: '2nd Main, Vijayanagar, Bangalore 560040', lat: 12.9719, lng: 77.5352 },
    delivery_area: 'Vijayanagar',
    items: [{ name: 'Insulin Glargine 100IU/mL', quantity: 1 }, { name: 'Metformin 500 mg', quantity: 60 }],
    distance_km: 6.5,
    stage_dates: {
      placed: { date: '19 May', time: '07:40' },
      dispensed: { date: '19 May', time: '09:00' },
      out_for_delivery: { date: '19 May', time: '10:20' },
    },
    assigned_at: '2026-05-19T09:30:00+05:30',
    out_for_delivery_at: '2026-05-19T10:20:00+05:30',
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC063': {
    order_id: 'FC063',
    assigned_agent_id: 'ag_01',
    order_status: 'delivered',
    patient_name: 'Ismail K.',
    patient_phone: '+919845667788',
    delivery_address: { full: '6th Cross, Frazer Town, Bangalore 560005', lat: 12.9975, lng: 77.6127 },
    delivery_area: 'Frazer Town',
    items: [{ name: 'Amoxicillin 500 mg', quantity: 15 }, { name: 'Vitamin B12', quantity: 30 }],
    distance_km: 3.9,
    stage_dates: {
      placed: { date: '19 May', time: '06:50' },
      dispensed: { date: '19 May', time: '08:00' },
      out_for_delivery: { date: '19 May', time: '09:10' },
      delivered: { date: '19 May', time: '10:05' },
    },
    assigned_at: '2026-05-19T07:30:00+05:30',
    out_for_delivery_at: '2026-05-19T09:10:00+05:30',
    delivered_at: '2026-05-19T10:05:00+05:30',
    proof_photo_url: 'https://picsum.photos/seed/proof5/400/300',
  },

  // ── Agent 02 extra orders (batch 2) ───────────────────────────────────────

  'FC064': {
    order_id: 'FC064',
    assigned_agent_id: 'ag_02',
    order_status: 'assigned',
    patient_name: 'Nandini S.',
    patient_phone: '+919886001122',
    delivery_address: { full: '1st Stage, Yeshwantpur, Bangalore 560022', lat: 13.0284, lng: 77.5540 },
    delivery_area: 'Yeshwantpur',
    items: [{ name: 'Montelukast 10 mg', quantity: 10 }, { name: 'Cetirizine 10 mg', quantity: 10 }],
    distance_km: 5.6,
    stage_dates: { placed: { date: '19 May', time: '08:00' }, dispensed: { date: '19 May', time: '09:10' } },
    assigned_at: '2026-05-19T10:15:00+05:30',
    out_for_delivery_at: null,
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC065': {
    order_id: 'FC065',
    assigned_agent_id: 'ag_02',
    order_status: 'out_for_delivery',
    patient_name: 'Chetan V.',
    patient_phone: '+919980112233',
    delivery_address: { full: '4th Block, RT Nagar, Bangalore 560032', lat: 13.0198, lng: 77.5943 },
    delivery_area: 'RT Nagar',
    items: [{ name: 'Rosuvastatin 10 mg', quantity: 30 }, { name: 'Ecosprin 75 mg', quantity: 30 }],
    distance_km: 4.0,
    stage_dates: {
      placed: { date: '19 May', time: '07:20' },
      dispensed: { date: '19 May', time: '08:30' },
      out_for_delivery: { date: '19 May', time: '09:45' },
    },
    assigned_at: '2026-05-19T08:50:00+05:30',
    out_for_delivery_at: '2026-05-19T09:45:00+05:30',
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC066': {
    order_id: 'FC066',
    assigned_agent_id: 'ag_02',
    order_status: 'delivered',
    patient_name: 'Shalini M.',
    patient_phone: '+919845223311',
    delivery_address: { full: 'Ring Road, Hebbal, Bangalore 560024', lat: 13.0358, lng: 77.5970 },
    delivery_area: 'Hebbal',
    items: [{ name: 'Calcium + Vitamin D3', quantity: 30 }, { name: 'Iron Folic Acid', quantity: 30 }],
    distance_km: 7.2,
    stage_dates: {
      placed: { date: '19 May', time: '06:30' },
      dispensed: { date: '19 May', time: '07:45' },
      out_for_delivery: { date: '19 May', time: '09:00' },
      delivered: { date: '19 May', time: '10:15' },
    },
    assigned_at: '2026-05-19T07:15:00+05:30',
    out_for_delivery_at: '2026-05-19T09:00:00+05:30',
    delivered_at: '2026-05-19T10:15:00+05:30',
    proof_photo_url: 'https://picsum.photos/seed/proof6/400/300',
  },

  // ── Agent 03 extra orders (batch 2) ───────────────────────────────────────

  'FC067': {
    order_id: 'FC067',
    assigned_agent_id: 'ag_03',
    order_status: 'assigned',
    patient_name: 'Deepak N.',
    patient_phone: '+919902334455',
    delivery_address: { full: 'Outer Ring Road, Bellandur, Bangalore 560103', lat: 12.9257, lng: 77.6761 },
    delivery_area: 'Bellandur',
    items: [{ name: 'Vildagliptin 50 mg', quantity: 30 }, { name: 'Metformin 500 mg', quantity: 60 }],
    distance_km: 6.9,
    stage_dates: { placed: { date: '19 May', time: '08:35' }, dispensed: { date: '19 May', time: '09:50' } },
    assigned_at: '2026-05-19T10:30:00+05:30',
    out_for_delivery_at: null,
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC068': {
    order_id: 'FC068',
    assigned_agent_id: 'ag_03',
    order_status: 'out_for_delivery',
    patient_name: 'Radhika J.',
    patient_phone: '+919611998877',
    delivery_address: { full: 'Sarjapur Main Road, Bangalore 560035', lat: 12.9077, lng: 77.6857 },
    delivery_area: 'Sarjapur Road',
    items: [{ name: 'Omeprazole 20 mg', quantity: 30 }, { name: 'Domperidone 10 mg', quantity: 30 }],
    distance_km: 8.1,
    stage_dates: {
      placed: { date: '19 May', time: '07:10' },
      dispensed: { date: '19 May', time: '08:20' },
      out_for_delivery: { date: '19 May', time: '09:40' },
    },
    assigned_at: '2026-05-19T08:45:00+05:30',
    out_for_delivery_at: '2026-05-19T09:40:00+05:30',
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC069': {
    order_id: 'FC069',
    assigned_agent_id: 'ag_03',
    order_status: 'delivered',
    patient_name: 'Manjunath H.',
    patient_phone: '+919742556677',
    delivery_address: { full: 'Old Madras Road, KR Puram, Bangalore 560036', lat: 12.9975, lng: 77.6959 },
    delivery_area: 'KR Puram',
    items: [{ name: 'Losartan 50 mg', quantity: 30 }, { name: 'Amlodipine 5 mg', quantity: 30 }],
    distance_km: 9.0,
    stage_dates: {
      placed: { date: '19 May', time: '06:45' },
      dispensed: { date: '19 May', time: '08:00' },
      out_for_delivery: { date: '19 May', time: '09:15' },
      delivered: { date: '19 May', time: '10:30' },
    },
    assigned_at: '2026-05-19T07:30:00+05:30',
    out_for_delivery_at: '2026-05-19T09:15:00+05:30',
    delivered_at: '2026-05-19T10:30:00+05:30',
    proof_photo_url: 'https://picsum.photos/seed/proof7/400/300',
  },

  // ── Agent 04 extra orders (batch 2) ───────────────────────────────────────

  'FC070': {
    order_id: 'FC070',
    assigned_agent_id: 'ag_04',
    order_status: 'assigned',
    patient_name: 'Swathi P.',
    patient_phone: '+919845990011',
    delivery_address: { full: '3rd Block, Banashankari, Bangalore 560070', lat: 12.9255, lng: 77.5468 },
    delivery_area: 'Banashankari',
    items: [{ name: 'Sitagliptin 100 mg', quantity: 30 }, { name: 'Metformin 1000 mg', quantity: 60 }],
    distance_km: 5.4,
    stage_dates: { placed: { date: '19 May', time: '08:05' }, dispensed: { date: '19 May', time: '09:20' } },
    assigned_at: '2026-05-19T10:05:00+05:30',
    out_for_delivery_at: null,
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC071': {
    order_id: 'FC071',
    assigned_agent_id: 'ag_04',
    order_status: 'out_for_delivery',
    patient_name: 'Gopal T.',
    patient_phone: '+919980667788',
    delivery_address: { full: '5th Cross, Domlur, Bangalore 560071', lat: 12.9611, lng: 77.6387 },
    delivery_area: 'Domlur',
    items: [{ name: 'Clopidogrel 75 mg', quantity: 30 }, { name: 'Rosuvastatin 20 mg', quantity: 30 }],
    distance_km: 3.6,
    stage_dates: {
      placed: { date: '19 May', time: '07:25' },
      dispensed: { date: '19 May', time: '08:40' },
      out_for_delivery: { date: '19 May', time: '09:55' },
    },
    assigned_at: '2026-05-19T09:00:00+05:30',
    out_for_delivery_at: '2026-05-19T09:55:00+05:30',
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC072': {
    order_id: 'FC072',
    assigned_agent_id: 'ag_04',
    order_status: 'delivered',
    patient_name: 'Asha B.',
    patient_phone: '+919845778899',
    delivery_address: { full: 'Doddaballapur Road, Yelahanka, Bangalore 560064', lat: 13.1007, lng: 77.5963 },
    delivery_area: 'Yelahanka',
    items: [{ name: 'Montelukast 10 mg', quantity: 10 }, { name: 'Multivitamin', quantity: 30 }],
    distance_km: 10.2,
    stage_dates: {
      placed: { date: '19 May', time: '06:20' },
      dispensed: { date: '19 May', time: '07:35' },
      out_for_delivery: { date: '19 May', time: '08:50' },
      delivered: { date: '19 May', time: '10:00' },
    },
    assigned_at: '2026-05-19T07:00:00+05:30',
    out_for_delivery_at: '2026-05-19T08:50:00+05:30',
    delivered_at: '2026-05-19T10:00:00+05:30',
    proof_photo_url: 'https://picsum.photos/seed/proof8/400/300',
  },

  // ── Agent 01 extra orders (batch 3) ───────────────────────────────────────

  'FC073': {
    order_id: 'FC073',
    assigned_agent_id: 'ag_01',
    order_status: 'assigned',
    patient_name: 'Roopa D.',
    patient_phone: '+919845110099',
    delivery_address: { full: '1st Cross, Richmond Town, Bangalore 560025', lat: 12.9635, lng: 77.6046 },
    delivery_area: 'Richmond Town',
    items: [{ name: 'Levothyroxine 100 mcg', quantity: 30 }, { name: 'Calcium + Vitamin D3', quantity: 30 }],
    distance_km: 2.7,
    stage_dates: { placed: { date: '20 May', time: '08:10' }, dispensed: { date: '20 May', time: '09:20' } },
    assigned_at: '2026-05-20T10:00:00+05:30',
    out_for_delivery_at: null,
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC074': {
    order_id: 'FC074',
    assigned_agent_id: 'ag_01',
    order_status: 'out_for_delivery',
    patient_name: 'Vinay S.',
    patient_phone: '+919901556677',
    delivery_address: { full: '8th Main, Ulsoor, Bangalore 560008', lat: 12.9815, lng: 77.6206 },
    delivery_area: 'Ulsoor',
    items: [{ name: 'Atorvastatin 10 mg', quantity: 30 }, { name: 'Ecosprin 75 mg', quantity: 30 }],
    distance_km: 3.1,
    stage_dates: {
      placed: { date: '20 May', time: '07:30' },
      dispensed: { date: '20 May', time: '08:45' },
      out_for_delivery: { date: '20 May', time: '10:00' },
    },
    assigned_at: '2026-05-20T09:15:00+05:30',
    out_for_delivery_at: '2026-05-20T10:00:00+05:30',
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC075': {
    order_id: 'FC075',
    assigned_agent_id: 'ag_01',
    order_status: 'delivered',
    patient_name: 'Zoya M.',
    patient_phone: '+919845332211',
    delivery_address: { full: '4th Cross, Shivajinagar, Bangalore 560051', lat: 12.9855, lng: 77.6057 },
    delivery_area: 'Shivajinagar',
    items: [{ name: 'Amoxicillin 500 mg', quantity: 15 }, { name: 'Paracetamol 650 mg', quantity: 10 }],
    distance_km: 2.4,
    stage_dates: {
      placed: { date: '20 May', time: '06:40' },
      dispensed: { date: '20 May', time: '07:50' },
      out_for_delivery: { date: '20 May', time: '09:00' },
      delivered: { date: '20 May', time: '09:55' },
    },
    assigned_at: '2026-05-20T07:20:00+05:30',
    out_for_delivery_at: '2026-05-20T09:00:00+05:30',
    delivered_at: '2026-05-20T09:55:00+05:30',
    proof_photo_url: 'https://picsum.photos/seed/proof9/400/300',
  },

  // ── Agent 02 extra orders (batch 3) ───────────────────────────────────────

  'FC076': {
    order_id: 'FC076',
    assigned_agent_id: 'ag_02',
    order_status: 'assigned',
    patient_name: 'Pavan K.',
    patient_phone: '+919886445566',
    delivery_address: { full: '2nd Stage, Basaveshwaranagar, Bangalore 560079', lat: 12.9908, lng: 77.5385 },
    delivery_area: 'Basaveshwaranagar',
    items: [{ name: 'Telmisartan 40 mg', quantity: 30 }, { name: 'Metoprolol 25 mg', quantity: 30 }],
    distance_km: 5.9,
    stage_dates: { placed: { date: '20 May', time: '08:25' }, dispensed: { date: '20 May', time: '09:40' } },
    assigned_at: '2026-05-20T10:20:00+05:30',
    out_for_delivery_at: null,
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC077': {
    order_id: 'FC077',
    assigned_agent_id: 'ag_02',
    order_status: 'out_for_delivery',
    patient_name: 'Sowmya R.',
    patient_phone: '+919980223344',
    delivery_address: { full: '3rd Cross, Peenya, Bangalore 560058', lat: 13.0286, lng: 77.5192 },
    delivery_area: 'Peenya',
    items: [{ name: 'Sitagliptin 50 mg', quantity: 30 }, { name: 'Metformin 500 mg', quantity: 60 }],
    distance_km: 8.4,
    stage_dates: {
      placed: { date: '20 May', time: '07:15' },
      dispensed: { date: '20 May', time: '08:25' },
      out_for_delivery: { date: '20 May', time: '09:40' },
    },
    assigned_at: '2026-05-20T08:50:00+05:30',
    out_for_delivery_at: '2026-05-20T09:40:00+05:30',
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC078': {
    order_id: 'FC078',
    assigned_agent_id: 'ag_02',
    order_status: 'delivered',
    patient_name: 'Naveen J.',
    patient_phone: '+919845667711',
    delivery_address: { full: '6th Main, Vidyaranyapura, Bangalore 560097', lat: 13.0716, lng: 77.5573 },
    delivery_area: 'Vidyaranyapura',
    items: [{ name: 'Amlodipine 10 mg', quantity: 30 }, { name: 'Losartan 25 mg', quantity: 30 }],
    distance_km: 9.6,
    stage_dates: {
      placed: { date: '20 May', time: '06:15' },
      dispensed: { date: '20 May', time: '07:30' },
      out_for_delivery: { date: '20 May', time: '08:45' },
      delivered: { date: '20 May', time: '09:50' },
    },
    assigned_at: '2026-05-20T07:00:00+05:30',
    out_for_delivery_at: '2026-05-20T08:45:00+05:30',
    delivered_at: '2026-05-20T09:50:00+05:30',
    proof_photo_url: 'https://picsum.photos/seed/proof10/400/300',
  },

  // ── Agent 03 extra orders (batch 3) ───────────────────────────────────────

  'FC079': {
    order_id: 'FC079',
    assigned_agent_id: 'ag_03',
    order_status: 'assigned',
    patient_name: 'Ananya V.',
    patient_phone: '+919611334455',
    delivery_address: { full: '5th Block, CV Raman Nagar, Bangalore 560093', lat: 12.9829, lng: 77.6648 },
    delivery_area: 'CV Raman Nagar',
    items: [{ name: 'Pantoprazole 40 mg', quantity: 30 }, { name: 'Domperidone 10 mg', quantity: 30 }],
    distance_km: 6.2,
    stage_dates: { placed: { date: '20 May', time: '08:15' }, dispensed: { date: '20 May', time: '09:30' } },
    assigned_at: '2026-05-20T10:10:00+05:30',
    out_for_delivery_at: null,
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC080': {
    order_id: 'FC080',
    assigned_agent_id: 'ag_03',
    order_status: 'out_for_delivery',
    patient_name: 'Suhas M.',
    patient_phone: '+919742778899',
    delivery_address: { full: '2nd Cross, Banaswadi, Bangalore 560043', lat: 13.0143, lng: 77.6510 },
    delivery_area: 'Banaswadi',
    items: [{ name: 'Rosuvastatin 10 mg', quantity: 30 }, { name: 'Clopidogrel 75 mg', quantity: 30 }],
    distance_km: 5.0,
    stage_dates: {
      placed: { date: '20 May', time: '07:05' },
      dispensed: { date: '20 May', time: '08:20' },
      out_for_delivery: { date: '20 May', time: '09:35' },
    },
    assigned_at: '2026-05-20T08:40:00+05:30',
    out_for_delivery_at: '2026-05-20T09:35:00+05:30',
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC081': {
    order_id: 'FC081',
    assigned_agent_id: 'ag_03',
    order_status: 'delivered',
    patient_name: 'Bhavana G.',
    patient_phone: '+919902445566',
    delivery_address: { full: '1st Main, Kengeri, Bangalore 560060', lat: 12.9081, lng: 77.4855 },
    delivery_area: 'Kengeri',
    items: [{ name: 'Multivitamin', quantity: 30 }, { name: 'Iron Folic Acid', quantity: 30 }],
    distance_km: 11.3,
    stage_dates: {
      placed: { date: '20 May', time: '06:10' },
      dispensed: { date: '20 May', time: '07:25' },
      out_for_delivery: { date: '20 May', time: '08:40' },
      delivered: { date: '20 May', time: '09:45' },
    },
    assigned_at: '2026-05-20T06:55:00+05:30',
    out_for_delivery_at: '2026-05-20T08:40:00+05:30',
    delivered_at: '2026-05-20T09:45:00+05:30',
    proof_photo_url: 'https://picsum.photos/seed/proof11/400/300',
  },

  // ── Agent 04 extra orders (batch 3) ───────────────────────────────────────

  'FC082': {
    order_id: 'FC082',
    assigned_agent_id: 'ag_04',
    order_status: 'assigned',
    patient_name: 'Rakesh P.',
    patient_phone: '+919845990022',
    delivery_address: { full: '3rd Main, Konanakunte, Bangalore 560062', lat: 12.8807, lng: 77.5595 },
    delivery_area: 'Konanakunte',
    items: [{ name: 'Glimepiride 1 mg', quantity: 30 }, { name: 'Metformin 500 mg', quantity: 60 }],
    distance_km: 8.8,
    stage_dates: { placed: { date: '20 May', time: '08:00' }, dispensed: { date: '20 May', time: '09:15' } },
    assigned_at: '2026-05-20T10:00:00+05:30',
    out_for_delivery_at: null,
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC083': {
    order_id: 'FC083',
    assigned_agent_id: 'ag_04',
    order_status: 'out_for_delivery',
    patient_name: 'Meghana S.',
    patient_phone: '+919980990011',
    delivery_address: { full: '7th Cross, Nagarbhavi, Bangalore 560072', lat: 12.9614, lng: 77.5033 },
    delivery_area: 'Nagarbhavi',
    items: [{ name: 'Olmesartan 20 mg', quantity: 30 }, { name: 'Hydrochlorothiazide 12.5 mg', quantity: 30 }],
    distance_km: 9.4,
    stage_dates: {
      placed: { date: '20 May', time: '07:35' },
      dispensed: { date: '20 May', time: '08:50' },
      out_for_delivery: { date: '20 May', time: '10:05' },
    },
    assigned_at: '2026-05-20T09:10:00+05:30',
    out_for_delivery_at: '2026-05-20T10:05:00+05:30',
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC084': {
    order_id: 'FC084',
    assigned_agent_id: 'ag_04',
    order_status: 'delivered',
    patient_name: 'Tejas N.',
    patient_phone: '+919845112200',
    delivery_address: { full: 'Hosur Road, Kudlu Gate, Bangalore 560068', lat: 12.8871, lng: 77.6521 },
    delivery_area: 'Kudlu Gate',
    items: [{ name: 'Aspirin 75 mg', quantity: 30 }, { name: 'Atorvastatin 20 mg', quantity: 30 }],
    distance_km: 7.7,
    stage_dates: {
      placed: { date: '20 May', time: '06:25' },
      dispensed: { date: '20 May', time: '07:40' },
      out_for_delivery: { date: '20 May', time: '08:55' },
      delivered: { date: '20 May', time: '10:00' },
    },
    assigned_at: '2026-05-20T07:10:00+05:30',
    out_for_delivery_at: '2026-05-20T08:55:00+05:30',
    delivered_at: '2026-05-20T10:00:00+05:30',
    proof_photo_url: 'https://picsum.photos/seed/proof12/400/300',
  },

  'FC085': {
    order_id: 'FC085',
    assigned_agent_id: 'ag_01',
    order_status: 'assigned',
    patient_name: 'Anitha R.',
    patient_phone: '+919845220011',
    delivery_address: { full: '80 Feet Road, Koramangala 4th Block, Bangalore 560034', lat: 12.9352, lng: 77.6245 },
    delivery_area: 'Koramangala',
    items: [{ name: 'Metformin 500 mg', quantity: 60 }, { name: 'Glimepiride 2 mg', quantity: 30 }],
    distance_km: 5.4,
    stage_dates: { placed: { date: '21 May', time: '07:50' }, dispensed: { date: '21 May', time: '09:05' } },
    assigned_at: '2026-05-21T09:30:00+05:30',
    out_for_delivery_at: null,
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC086': {
    order_id: 'FC086',
    assigned_agent_id: 'ag_01',
    order_status: 'out_for_delivery',
    patient_name: 'Vinay K.',
    patient_phone: '+919980112233',
    delivery_address: { full: '100 Feet Road, Indiranagar, Bangalore 560038', lat: 12.9784, lng: 77.6408 },
    delivery_area: 'Indiranagar',
    items: [{ name: 'Amlodipine 5 mg', quantity: 30 }, { name: 'Telmisartan 40 mg', quantity: 30 }],
    distance_km: 6.1,
    stage_dates: {
      placed: { date: '21 May', time: '07:20' },
      dispensed: { date: '21 May', time: '08:35' },
      out_for_delivery: { date: '21 May', time: '09:50' },
    },
    assigned_at: '2026-05-21T08:40:00+05:30',
    out_for_delivery_at: '2026-05-21T09:50:00+05:30',
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC087': {
    order_id: 'FC087',
    assigned_agent_id: 'ag_02',
    order_status: 'assigned',
    patient_name: 'Divya S.',
    patient_phone: '+919845330022',
    delivery_address: { full: 'ITPL Main Road, Whitefield, Bangalore 560066', lat: 12.9698, lng: 77.7500 },
    delivery_area: 'Whitefield',
    items: [{ name: 'Atorvastatin 10 mg', quantity: 30 }, { name: 'Aspirin 75 mg', quantity: 30 }],
    distance_km: 11.2,
    stage_dates: { placed: { date: '21 May', time: '08:05' }, dispensed: { date: '21 May', time: '09:20' } },
    assigned_at: '2026-05-21T09:45:00+05:30',
    out_for_delivery_at: null,
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC088': {
    order_id: 'FC088',
    assigned_agent_id: 'ag_02',
    order_status: 'out_for_delivery',
    patient_name: 'Naveen T.',
    patient_phone: '+919900112244',
    delivery_address: { full: 'Outer Ring Road, Marathahalli, Bangalore 560037', lat: 12.9569, lng: 77.7011 },
    delivery_area: 'Marathahalli',
    items: [{ name: 'Losartan 50 mg', quantity: 30 }, { name: 'Metformin 1000 mg', quantity: 60 }],
    distance_km: 9.6,
    stage_dates: {
      placed: { date: '21 May', time: '07:40' },
      dispensed: { date: '21 May', time: '08:55' },
      out_for_delivery: { date: '21 May', time: '10:10' },
    },
    assigned_at: '2026-05-21T08:50:00+05:30',
    out_for_delivery_at: '2026-05-21T10:10:00+05:30',
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC089': {
    order_id: 'FC089',
    assigned_agent_id: 'ag_03',
    order_status: 'assigned',
    patient_name: 'Lakshmi N.',
    patient_phone: '+919845440033',
    delivery_address: { full: '24th Main, JP Nagar 6th Phase, Bangalore 560078', lat: 12.9077, lng: 77.5906 },
    delivery_area: 'JP Nagar',
    items: [{ name: 'Glimepiride 1 mg', quantity: 30 }, { name: 'Pioglitazone 15 mg', quantity: 30 }],
    distance_km: 7.3,
    stage_dates: { placed: { date: '21 May', time: '08:15' }, dispensed: { date: '21 May', time: '09:30' } },
    assigned_at: '2026-05-21T10:00:00+05:30',
    out_for_delivery_at: null,
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC090': {
    order_id: 'FC090',
    assigned_agent_id: 'ag_03',
    order_status: 'out_for_delivery',
    patient_name: 'Manoj D.',
    patient_phone: '+919900223355',
    delivery_address: { full: '16th Main, BTM Layout 2nd Stage, Bangalore 560076', lat: 12.9166, lng: 77.6101 },
    delivery_area: 'BTM Layout',
    items: [{ name: 'Rosuvastatin 10 mg', quantity: 30 }, { name: 'Clopidogrel 75 mg', quantity: 30 }],
    distance_km: 6.8,
    stage_dates: {
      placed: { date: '21 May', time: '07:55' },
      dispensed: { date: '21 May', time: '09:10' },
      out_for_delivery: { date: '21 May', time: '10:25' },
    },
    assigned_at: '2026-05-21T09:15:00+05:30',
    out_for_delivery_at: '2026-05-21T10:25:00+05:30',
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC091': {
    order_id: 'FC091',
    assigned_agent_id: 'ag_04',
    order_status: 'assigned',
    patient_name: 'Sowmya K.',
    patient_phone: '+919845550044',
    delivery_address: { full: 'Bellary Road, Yelahanka New Town, Bangalore 560064', lat: 13.1007, lng: 77.5963 },
    delivery_area: 'Yelahanka',
    items: [{ name: 'Metoprolol 25 mg', quantity: 30 }, { name: 'Aspirin 75 mg', quantity: 30 }],
    distance_km: 14.5,
    stage_dates: { placed: { date: '21 May', time: '08:25' }, dispensed: { date: '21 May', time: '09:40' } },
    assigned_at: '2026-05-21T10:10:00+05:30',
    out_for_delivery_at: null,
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC092': {
    order_id: 'FC092',
    assigned_agent_id: 'ag_04',
    order_status: 'out_for_delivery',
    patient_name: 'Harish B.',
    patient_phone: '+919900334466',
    delivery_address: { full: 'Kanakapura Road, Banashankari 3rd Stage, Bangalore 560085', lat: 12.9255, lng: 77.5468 },
    delivery_area: 'Banashankari',
    items: [{ name: 'Olmesartan 20 mg', quantity: 30 }, { name: 'Hydrochlorothiazide 12.5 mg', quantity: 30 }],
    distance_km: 8.2,
    stage_dates: {
      placed: { date: '21 May', time: '08:00' },
      dispensed: { date: '21 May', time: '09:15' },
      out_for_delivery: { date: '21 May', time: '10:30' },
    },
    assigned_at: '2026-05-21T09:20:00+05:30',
    out_for_delivery_at: '2026-05-21T10:30:00+05:30',
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC093': {
    order_id: 'FC093',
    assigned_agent_id: 'ag_01',
    order_status: 'assigned',
    patient_name: 'Priya M.',
    patient_phone: '+919845660055',
    delivery_address: { full: '27th Main, HSR Layout Sector 2, Bangalore 560102', lat: 12.9116, lng: 77.6389 },
    delivery_area: 'HSR Layout',
    items: [{ name: 'Sitagliptin 50 mg', quantity: 30 }, { name: 'Metformin 500 mg', quantity: 60 }],
    distance_km: 6.5,
    stage_dates: { placed: { date: '21 May', time: '08:35' }, dispensed: { date: '21 May', time: '09:50' } },
    assigned_at: '2026-05-21T10:20:00+05:30',
    out_for_delivery_at: null,
    delivered_at: null,
    proof_photo_url: null,
  },

  'FC094': {
    order_id: 'FC094',
    assigned_agent_id: 'ag_02',
    order_status: 'out_for_delivery',
    patient_name: 'Deepak R.',
    patient_phone: '+919900445577',
    delivery_address: { full: 'Hosur Road, Electronic City Phase 1, Bangalore 560100', lat: 12.8452, lng: 77.6602 },
    delivery_area: 'Electronic City',
    items: [{ name: 'Amlodipine 10 mg', quantity: 30 }, { name: 'Atorvastatin 20 mg', quantity: 30 }],
    distance_km: 15.8,
    stage_dates: {
      placed: { date: '21 May', time: '08:10' },
      dispensed: { date: '21 May', time: '09:25' },
      out_for_delivery: { date: '21 May', time: '10:40' },
    },
    assigned_at: '2026-05-21T09:35:00+05:30',
    out_for_delivery_at: '2026-05-21T10:40:00+05:30',
    delivered_at: null,
    proof_photo_url: null,
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowISO() { return new Date().toISOString(); }

function nowLabel() {
  const now = new Date();
  const date = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  return { date, time };
}

function issueToken(agent) {
  return jwt.sign(
    { sub: agent.id, role: 'agent', phone: agent.phone },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}


// ─── ETA ─────────────────────────────────────────────────────────────────────

function haversineMinutes(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.max(1, Math.round((distKm / 20) * 60));
}

// Random mock distance/ETA — always >= 5.0 km and >= 12 minutes
function randomMockETA() {
  const distKm = +(5.0 + Math.random() * 45).toFixed(1);   // 5.0 – 50.0 km
  const minutes = Math.round(12 + Math.random() * 33);      // 12 – 45 min
  const arrivesAt = new Date(Date.now() + minutes * 60 * 1000)
    .toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  return { distKm, eta: { minutes, arrives_at: arrivesAt, computed_at: nowISO(), source: 'mock' } };
}

async function computeETA(agentLat, agentLng, destLat, destLng) {
  if (GOOGLE_MAPS_API_KEY) {
    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${agentLat},${agentLng}&destination=${destLat},${destLng}&mode=two_wheeler&key=${GOOGLE_MAPS_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.status === 'OK' && data.routes?.[0]?.legs?.[0]) {
        const leg = data.routes[0].legs[0];
        console.log(`✅ [ETA] distance: ${leg.distance.text} | duration: ${leg.duration.text} (${leg.duration.value}s)`);
        const seconds = leg.duration.value;
        const minutes = Math.max(1, Math.round(seconds / 60));
        const arrivesAt = new Date(Date.now() + seconds * 1000);
        return {
          minutes,
          arrives_at: arrivesAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
          computed_at: nowISO(),
          source: 'google',
        };
      }
      console.warn(`❌ [ETA] Google status: ${data.status}`);
    } catch (err) {
      console.warn(`💥 [ETA] Google failed: ${err.message}`);
    }
  }
  const minutes = haversineMinutes(agentLat, agentLng, destLat, destLng);
  return {
    minutes,
    arrives_at: new Date(Date.now() + minutes * 60 * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
    computed_at: nowISO(),
    source: 'haversine',
  };
}

// ─── Auth middleware ──────────────────────────────────────────────────────────

function requireAgentAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    if (payload.role !== 'agent') {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    req.agentId = payload.sub;
    req.agentPhone = payload.phone;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

// ─── POST /agent/auth/send-otp ────────────────────────────────────────────────
app.post('/agent/auth/send-otp', (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ success: false, message: 'Phone is required' });
  // Accept any phone for POC — real backend checks agent exists
  console.log(`  → OTP for ${phone}: ${MOCK_OTP}`);
  res.json({ success: true, message: 'OTP sent to your registered number' });
});

// ─── POST /agent/auth/verify-otp ─────────────────────────────────────────────
app.post('/agent/auth/verify-otp', (req, res) => {
  const { phone, otp } = req.body;
  if (otp !== MOCK_OTP) {
    return res.status(400).json({ success: false, message: 'Invalid code. Please try again.' });
  }
  // Look up or create agent on the fly for POC
  let agent = agents[phone];
  if (!agent) {
    const id = `ag_${Date.now()}`;
    agent = { id, name: 'Agent', phone, fcm_token: null };
    agents[phone] = agent;
  }
  const token = issueToken(agent);
  res.json({
    success: true,
    response: { token, agent: { id: agent.id, name: agent.name, phone: agent.phone } },
  });
});

// ─── POST /agent/auth/register-device ────────────────────────────────────────
app.post('/agent/auth/register-device', requireAgentAuth, (req, res) => {
  const { fcm_token } = req.body;
  const agent = Object.values(agents).find(a => a.id === req.agentId);
  if (agent && fcm_token) agent.fcm_token = fcm_token;
  res.json({ success: true });
});

// ─── POST /agent/auth/logout ──────────────────────────────────────────────────
app.post('/agent/auth/logout', requireAgentAuth, (_req, res) => {
  res.json({ success: true });
});

// ─── GET /agent/orders ────────────────────────────────────────────────────────
app.get('/agent/orders', requireAgentAuth, (req, res) => {
  const TERMINAL = ['delivered', 'cancelled', 'failed_delivery'];
  const agentOrders = Object.values(orders).filter(o => o.assigned_agent_id === req.agentId);

  const active = agentOrders
    .filter(o => !TERMINAL.includes(o.order_status))
    .map(o => ({
      order_id: o.order_id,
      order_status: o.order_status,
      patient_name: o.patient_name,
      patient_phone: o.patient_phone,
      delivery_address: o.delivery_address,
      delivery_area: o.delivery_area,
      items: o.items,
      distance_km: o.distance_km,
      stage_dates: o.stage_dates,
      assigned_at: o.assigned_at,
      out_for_delivery_at: o.out_for_delivery_at,
    }));

  const completed = agentOrders
    .filter(o => o.order_status === 'delivered')
    .map(o => ({
      order_id: o.order_id,
      order_status: o.order_status,
      patient_name: o.patient_name,
      delivery_area: o.delivery_area,
      delivered_at: o.delivered_at,
    }));

  res.json({
    success: true,
    response: {
      active,
      completed,
      summary: {
        active_count: active.length,
        today_count: active.length + completed.length,
        in_transit_count: active.filter(o => o.order_status === 'out_for_delivery').length,
      },
    },
  });
});

// ─── GET /agent/orders/:orderId ───────────────────────────────────────────────
app.get('/agent/orders/:orderId', requireAgentAuth, (req, res) => {
  const order = orders[req.params.orderId];
  if (!order || order.assigned_agent_id !== req.agentId) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }
  res.json({ success: true, response: order });
});

// ─── POST /agent/orders/:orderId/out-for-delivery ─────────────────────────────
app.post('/agent/orders/:orderId/out-for-delivery', requireAgentAuth, (req, res) => {
  const order = orders[req.params.orderId];
  if (!order || order.assigned_agent_id !== req.agentId) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }
  if (order.order_status === 'out_for_delivery') {
    return res.json({ success: true, response: { order_id: order.order_id, order_status: order.order_status, out_for_delivery_at: order.out_for_delivery_at } });
  }
  if (['delivered', 'cancelled', 'failed_delivery'].includes(order.order_status)) {
    return res.status(400).json({ success: false, message: 'Order is not ready to be dispatched' });
  }

  const label = nowLabel();
  order.order_status = 'out_for_delivery';
  order.out_for_delivery_at = nowISO();
  order.stage_dates.out_for_delivery = label;

  console.log(`  → ${order.order_id} → out_for_delivery`);
  res.json({ success: true, response: { order_id: order.order_id, order_status: order.order_status, out_for_delivery_at: order.out_for_delivery_at } });
});

// ─── Delivery confirmation (OTP + override) ────────────────────────────────────
const DELIVERY_OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const DELIVERY_OTP_MAX_ATTEMPTS = 5;

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ─── POST /agent/orders/:orderId/delivery-otp/send ─────────────────────────────
app.post('/agent/orders/:orderId/delivery-otp/send', requireAgentAuth, (req, res) => {
  const order = orders[req.params.orderId];
  if (!order || order.assigned_agent_id !== req.agentId) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }
  if (order.order_status !== 'out_for_delivery') {
    return res.status(400).json({ success: false, message: 'Order is not out for delivery' });
  }

  const code = generateOtp();
  order.delivery_otp = {
    code,
    expires_at: Date.now() + DELIVERY_OTP_TTL_MS,
    attempts: 0,
    verified: false,
  };

  // No SMS/email gateway wired up in this POC — logged the same way the
  // agent-login OTP is, and echoed back as `demo_code` for the app's demo hint.
  console.log(`  → Delivery OTP for ${order.order_id} (${order.patient_name}): ${code}`);

  res.json({
    success: true,
    response: {
      sent: true,
      expires_in: DELIVERY_OTP_TTL_MS / 1000,
      demo_code: code,
    },
  });
});

// ─── POST /agent/orders/:orderId/delivery-otp/verify ───────────────────────────
app.post('/agent/orders/:orderId/delivery-otp/verify', requireAgentAuth, (req, res) => {
  const order = orders[req.params.orderId];
  if (!order || order.assigned_agent_id !== req.agentId) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  const { otp } = req.body;
  const record = order.delivery_otp;
  if (!record) {
    return res.status(400).json({ success: false, message: 'Request a code first' });
  }
  if (Date.now() > record.expires_at) {
    return res.status(400).json({ success: false, message: 'Code expired. Please resend.' });
  }
  if (record.attempts >= DELIVERY_OTP_MAX_ATTEMPTS) {
    return res.status(429).json({ success: false, message: 'Too many attempts. Please resend.' });
  }
  if (otp !== record.code) {
    record.attempts += 1;
    return res.status(400).json({
      success: false,
      message: 'Incorrect code',
      response: { attempts_remaining: DELIVERY_OTP_MAX_ATTEMPTS - record.attempts },
    });
  }

  record.verified = true;
  console.log(`  → Delivery OTP verified for ${order.order_id}`);
  res.json({ success: true, response: { verified: true } });
});

// ─── POST /agent/orders/:orderId/delivery-override ─────────────────────────────
// Logged + audited path used when the patient genuinely cannot share the OTP.
app.post('/agent/orders/:orderId/delivery-override', requireAgentAuth, upload.single('id_card'), (req, res) => {
  const order = orders[req.params.orderId];
  if (!order || order.assigned_agent_id !== req.agentId) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }
  const { reason } = req.body;
  if (!reason) {
    return res.status(400).json({ success: false, message: 'Reason is required' });
  }
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Patient ID card photo is required' });
  }

  order.delivery_override_reason = reason;
  order.id_card_captured_at = nowISO();

  console.log(`  → ${order.order_id} delivery override recorded: "${reason}" (id card: ${req.file.size} bytes)`);
  res.json({
    success: true,
    response: {
      order_id: order.order_id,
      override_reason: reason,
      id_card_captured: true,
    },
  });
});

// ─── POST /agent/orders/:orderId/deliver ──────────────────────────────────────
app.post('/agent/orders/:orderId/deliver', requireAgentAuth, upload.single('photo'), (req, res) => {
  const order = orders[req.params.orderId];
  if (!order || order.assigned_agent_id !== req.agentId) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Photo is required' });
  }
  if (order.order_status === 'delivered') {
    return res.json({ success: true, response: { order_id: order.order_id, order_status: order.order_status, delivered_at: order.delivered_at, proof_photo_url: order.proof_photo_url } });
  }

  // Delivery must be confirmed — either the patient's OTP was verified, or an
  // audited override (reason + ID card) was recorded via /delivery-override.
  const overrideReason = req.body.override_reason || order.delivery_override_reason;
  if (!order.delivery_otp?.verified && !overrideReason) {
    return res.status(400).json({
      success: false,
      message: 'Delivery must be confirmed via OTP or a recorded override before marking delivered.',
    });
  }

  const label = nowLabel();
  order.order_status = 'delivered';
  order.delivered_at = req.body.delivered_at || nowISO();
  order.proof_photo_url = `https://picsum.photos/seed/${order.order_id}/400/300`;
  order.stage_dates.delivered = label;
  if (overrideReason) order.delivery_override_reason = overrideReason;

  console.log(`  → ${order.order_id} → delivered (photo: ${req.file.size} bytes)${overrideReason ? ` [override: ${overrideReason}]` : ''}`);
  res.json({ success: true, response: { order_id: order.order_id, order_status: order.order_status, delivered_at: order.delivered_at, proof_photo_url: order.proof_photo_url } });
});

// ─── POST /agent/location ─────────────────────────────────────────────────────
app.post('/agent/location', requireAgentAuth, (req, res) => {
  const { lat, lng, bearing, accuracy, timestamp } = req.body;
  if (lat === undefined || lng === undefined || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ success: false, message: 'Invalid lat/lng' });
  }
  locationCache[req.agentId] = { lat, lng, bearing: bearing ?? 0, accuracy: accuracy ?? 0, reported_at: timestamp || nowISO() };
  res.json({ success: true });
});

// ─── GET /orders/:orderId/tracking  (patient app) ─────────────────────────────
// No agent auth — patient app calls this with its own token or no token for POC
app.get('/orders/:orderId/tracking', async (req, res) => {
  try {
    const DEMO_ORDER_ID = 'FC042';
    const order = orders[req.params.orderId] || orders[DEMO_ORDER_ID];

    const agent = Object.values(agents).find(a => a.id === order.assigned_agent_id);
    const location = locationCache[order.assigned_agent_id] || null;

    let eta = null;
    let distance_km = null;

    if (order.order_status === 'out_for_delivery') {
      if (location) {
        eta = await computeETA(location.lat, location.lng, order.delivery_address.lat, order.delivery_address.lng);
        // Clamp to minimum 12 minutes so demo never shows "almost arrived"
        if (eta.minutes < 12) {
          eta.minutes = Math.round(12 + Math.random() * 8);
          eta.arrives_at = new Date(Date.now() + eta.minutes * 60 * 1000)
            .toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        }
        distance_km = order.distance_km ?? null;
      } else {
        // No live location — generate random mock values (>= 5 km, >= 12 min)
        const mock = randomMockETA();
        eta = mock.eta;
        distance_km = mock.distKm;
      }
    }

    res.json({
      success: true,
      response: {
        order_id: req.params.orderId,
        order_status: order.order_status,
        stage_dates: order.stage_dates,
        agent: agent ? { name: agent.name, phone: agent.phone } : null,
        agent_location: location,
        destination: order.delivery_address ? { lat: order.delivery_address.lat, lng: order.delivery_address.lng } : null,
        distance_km,
        eta,
        delivered_at: order.delivered_at ?? null,
        proof_photo_url: order.proof_photo_url ?? null,
      },
    });
  } catch (err) {
    console.error('💥 [Tracking] Handler error:', err.message);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  const orderList = Object.values(orders);
  res.json({
    status: 'ok',
    agents: Object.keys(agents).length,
    orders: {
      total: orderList.length,
      assigned: orderList.filter(o => o.order_status === 'assigned').length,
      out_for_delivery: orderList.filter(o => o.order_status === 'out_for_delivery').length,
      delivered: orderList.filter(o => o.order_status === 'delivered').length,
    },
  });
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `No route: ${req.method} ${req.url}` });
});

// ─── Agent movement simulation ────────────────────────────────────────────────
// Moves ag_01 along a small loop toward FC042's destination so
// the patient app map animates without needing the real agent app running.
const SIM_WAYPOINTS = [
  { lat: 12.9335, lng: 77.6215 },
  { lat: 12.9320, lng: 77.6225 },
  { lat: 12.9310, lng: 77.6240 },
  { lat: 12.9295, lng: 77.6255 },
  { lat: 12.9285, lng: 77.6265 },
  { lat: 12.9279, lng: 77.6271 }, // destination
  { lat: 12.9285, lng: 77.6265 },
  { lat: 12.9295, lng: 77.6255 },
  { lat: 12.9310, lng: 77.6240 },
  { lat: 12.9320, lng: 77.6225 },
];
let simIndex = 0;

function stepSimulation() {
  // Only simulate when no real agent app is posting (location older than 20s)
  const cached = locationCache['ag_01'];
  const ageMs = cached ? Date.now() - new Date(cached.reported_at).getTime() : Infinity;
  if (ageMs < 20000) return; // real agent is posting — don't override

  const wp = SIM_WAYPOINTS[simIndex % SIM_WAYPOINTS.length];
  locationCache['ag_01'] = { lat: wp.lat, lng: wp.lng, bearing: 120, accuracy: 10, reported_at: nowISO() };
  simIndex++;
  console.log(`[Sim] ag_01 → ${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)} (waypoint ${simIndex % SIM_WAYPOINTS.length})`);
}

setInterval(stepSimulation, 8000);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('==========================================');
  console.log('  AZCares Delivery — POC Backend');
  console.log('==========================================');
  console.log(`  Port     : ${PORT}`);
  console.log(`  OTP      : ${MOCK_OTP}  (any phone works)`);
  console.log('');
  console.log('  Endpoints:');
  console.log('  POST /agent/auth/send-otp');
  console.log('  POST /agent/auth/verify-otp');
  console.log('  POST /agent/auth/register-device');
  console.log('  POST /agent/auth/logout');
  console.log('  GET  /agent/orders');
  console.log('  GET  /agent/orders/:id');
  console.log('  POST /agent/orders/:id/out-for-delivery');
  console.log('  POST /agent/orders/:id/delivery-otp/send');
  console.log('  POST /agent/orders/:id/delivery-otp/verify');
  console.log('  POST /agent/orders/:id/delivery-override');
  console.log('  POST /agent/orders/:id/deliver');
  console.log('  POST /agent/location');
  console.log('  GET  /orders/:id/tracking   ← patient app');
  console.log('  GET  /health');
  console.log('==========================================');
  console.log('');
});
