import { emissionService } from "./api/emissionService.js";
import { TokenManager } from "./api/tokenManager.js";
import { renderLayout } from "./layout.js";
import { showToast } from "./utils/uiUtils.js";
import { companyService } from "./api/companyService.js";
import { gamificationService } from "./api/gamificationService.js";
import {
  triggerConfetti,
  showXpGain,
  showLevelUp,
  showBadgeUnlock,
} from "./utils/confetti.js";
import { normalizeCategory } from "./utils/categoryNormalizer.js";
import { RISK_LABELS, RISK_COLORS } from "./utils/labelUtils.js";

// Edit mode: check for ?edit=<id> URL param
const _urlParams = new URLSearchParams(window.location.search);
const editId = _urlParams.get("edit");
const isEditMode = !!editId;

const user = renderLayout({
  activeNav: "nav-add",
  title: isEditMode ? "Kaydı Düzenle" : undefined,
});
if (!user) throw new Error("redirect");

if (user.role === "company") {
  const _cbamCard = document.getElementById("cardCbam");
  if (_cbamCard) _cbamCard.style.display = "";
}

// ── Data model ────────────────────────────────────────────────────────────────
// inputType: 'quantity' → quantity required, unit shown
//            'spend'    → totalAmount TRY required, quantity hidden
//            'flight'   → origin/dest required, quantity & amount hidden
const ACTIVITY_MAP = {
  energy: [
    {
      id: "electricity",
      label: "Elektrik",
      units: ["kWh"],
      inputType: "quantity",
    },
  ],
  water: [
    {
      id: "water_usage",
      label: "Su Kullanımı",
      units: ["m3", "l"],
      inputType: "quantity",
    },
  ],
  gas: [
    {
      id: "natural_gas",
      label: "Doğalgaz",
      units: ["m3", "kWh"],
      inputType: "quantity",
    },
  ],
  transport: [
    {
      id: "car_petrol",
      label: "Benzinli Araç ",
      units: ["km"],
      inputType: "quantity",
    },
    {
      id: "car_diesel",
      label: "Dizel Araç",
      units: ["km"],
      inputType: "quantity",
    },

    { id: "bus", label: "Otobüs", units: ["km"], inputType: "quantity" },
    { id: "train", label: "Tren", units: ["km"], inputType: "quantity" },
    {
      id: "flight_short",
      label: "Kısa Mesafe Uçuş",
      units: ["km"],
      inputType: "flight",
    },
    {
      id: "flight_long",
      label: "Uzun Mesafe Uçuş",
      units: ["km"],
      inputType: "flight",
    },
  ],
  materials: [
    { id: "plastic", label: "Plastik", units: ["TRY"], inputType: "spend" },
    { id: "paper", label: "Kağıt", units: ["kg"], inputType: "quantity" },
  ],
  waste: [
    {
      id: "waste_general",
      label: "Genel Atık",
      units: ["kg"],
      inputType: "quantity",
    },
  ],
  food: [
    {
      id: "beef_red_meat",
      label: "Sığır / Kırmızı Et",
      units: ["kg"],
      inputType: "quantity",
    },
    { id: "chicken", label: "Tavuk", units: ["kg"], inputType: "quantity" },
    {
      id: "vegetables",
      label: "Sebze / Meyve / Kuruyemiş",
      units: ["TRY"],
      inputType: "spend",
    },
    {
      id: "rice_grains",
      label: "Pirinç / Tahıl",
      units: ["kg"],
      inputType: "quantity",
    },
  ],
  shopping: [
    {
      id: "shopping_general",
      label: "Genel Alışveriş",
      units: ["TRY"],
      inputType: "spend",
    },
    {
      id: "office_supplies",
      label: "Ofis Malzemeleri",
      units: ["TRY"],
      inputType: "spend",
    },
    {
      id: "electronics",
      label: "Elektronik",
      units: ["TRY"],
      inputType: "spend",
    },
  ],
};

// Maps simplified activity IDs → Climatiq activityId + API unit.
// convert: { inputUnit: fn } transforms the user's quantity to what the API expects.
// spendBased: true → quantity is a TRY→USD converted amount, API unit is 'usd'.
const CLIMATIQ_MAP = {
  electricity: {
    activityId: "electricity-supply_grid-source_supplier_mix",
    apiUnit: "kWh",
  },
  water_usage: {
    activityId: "water_supply-type_na",
    apiUnit: "l",
    convert: { m3: (v) => v * 1000 },
  },
  natural_gas: {
    activityId: "fuel-type_gaseous_fuels_net-fuel_use_na",
    apiUnit: "kWh",
    convert: { m3: (v) => v * 10.55 },
  },
  car_petrol: {
    activityId:
      "passenger_vehicle-vehicle_type_car-fuel_source_petrol-engine_size_na-vehicle_age_na-vehicle_weight_na",
    apiUnit: "km",
  },
  car_diesel: {
    activityId:
      "passenger_vehicle-vehicle_type_car-fuel_source_diesel-engine_size_na-vehicle_age_na-vehicle_weight_na",
    apiUnit: "km",
  },
  petrol_vehicle: {
    activityId: "fuel_combustion-type_motor_gasoline",
    apiUnit: "l",
  },
  diesel_vehicle: {
    activityId: "fuel_combustion-type_automotive_diesel_oil",
    apiUnit: "l",
  },
  bus: {
    activityId:
      "passenger_vehicle-vehicle_type_bus-fuel_source_na-engine_size_na-vehicle_age_na-vehicle_weight_na",
    apiUnit: "km",
  },
  train: {
    activityId: "passenger_train-route_type_na-fuel_source_na",
    apiUnit: "km",
    localCoefficient: 0.041,
  },
  // flight_short / flight_long → handled via { from, to } in buildPayload()
  plastic: {
    activityId: "general_retail-type_nonstore_retailers",
    apiUnit: "usd",
    spendBased: true,
  },
  paper: {
    activityId: "paper_and_cardboard-type_paper_average_source",
    apiUnit: "kg",
  },
  waste_general: {
    activityId:
      "waste_management-type_solid_waste_disposal-disposal_method_managed_waste_disposal_sites",
    apiUnit: "kg",
  },
  recycling: {
    activityId: "waste_management-type_recycling-disposal_method_recycling_na",
    apiUnit: "kg",
  },
  vegetables: {
    activityId: "arable_farming-type_vegetables_fruit_nuts",
    apiUnit: "usd",
    spendBased: true,
  },
  office_supplies: {
    activityId: "general_retail-type_nonstore_retailers",
    apiUnit: "usd",
    spendBased: true,
  },
  electronics: {
    activityId: "general_retail-type_nonstore_retailers",
    apiUnit: "usd",
    spendBased: true,
  },
  shopping_general: {
    activityId: "general_retail-type_nonstore_retailers",
    apiUnit: "usd",
    spendBased: true,
  },
};

// Fallback TRY → USD rate used when no OCR exchange rate is available
const TRY_USD_FALLBACK = 38;

// Both OCR (Textract) and Groq output use normalizeCategory() for canonical mapping.

// ── DOM refs ──────────────────────────────────────────────────────────────────
const cardManual = document.getElementById("cardManual");
const cardVisual = document.getElementById("cardVisual");
const cardCbam = document.getElementById("cardCbam");
const uploadSection = document.getElementById("uploadSection");
const cbamSection = document.getElementById("cbamSection");
const uploadZone = document.getElementById("uploadZone");
const fileInput = document.getElementById("fileInput");
const scanStatus = document.getElementById("scanStatus");
const categoryEl = document.getElementById("category");
const activityEl = document.getElementById("activityType");
const fuelReceiptHint = document.getElementById("fuelReceiptHint");
const flightRow = document.getElementById("flightRow");
const originEl = document.getElementById("origin");
const destEl = document.getElementById("dest");
const quantityRow = document.getElementById("quantityRow");
const quantityEl = document.getElementById("quantity");
const unitSelect = document.getElementById("unitSelect");
const amountRow = document.getElementById("amountRow");
const totalAmountEl = document.getElementById("totalAmount");
const entryDateEl = document.getElementById("entryDate");
const descriptionEl = document.getElementById("description");
const calcStatusEl = document.getElementById("calcStatus");
const resultBanner = document.getElementById("resultBanner");
const resultCo2El = document.getElementById("resultCo2");
const calcBtn = document.getElementById("calcBtn");
const saveBtn = document.getElementById("saveBtn");
const clearBtn = document.getElementById("clearBtn");
const debugOutput = document.getElementById("debugOutput");
const entryForm = document.getElementById("entryForm");

let currentMethod = "manual";
let calculatedCo2 = null;
let lastOcrData = null;

const setText = (id, value) => {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
};

// ── Date bounds ───────────────────────────────────────────────────────────────
const today = new Date().toISOString().split("T")[0];
const minDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
  .toISOString()
  .split("T")[0];
entryDateEl.setAttribute("max", today);
entryDateEl.setAttribute("min", minDate);
entryDateEl.value = today;

// ── Edit mode init ────────────────────────────────────────────────────────────
if (isEditMode) {
  (async () => {
    try {
      const { record } = await emissionService.getById(editId);
      if (!record) throw new Error("Kayıt bulunamadı.");

      // Tarih
      if (record.date) entryDateEl.value = record.date.slice(0, 10);

      // Kategori + aktivite
      if (
        record.category &&
        categoryEl.querySelector(`option[value="${record.category}"]`)
      ) {
        categoryEl.value = record.category;
        onCategoryChange();
        if (
          record.activity_type &&
          activityEl.querySelector(`option[value="${record.activity_type}"]`)
        ) {
          activityEl.value = record.activity_type;
          onActivityChange();
        }
      }

      // Mevcut CO₂ değerini yükle → hesapla butonuna basmadan kaydedilebilir
      calculatedCo2 = parseFloat(record.amount);
      showResult(calculatedCo2);

      // UI metinlerini güncelle
      const h1 = document.querySelector("h1");
      if (h1) h1.textContent = "Kaydı Düzenle";
      saveBtn.textContent = "✔ Güncelle";
    } catch (err) {
      showToast("Hata", err.message || "Kayıt yüklenemedi.", "error");
    }
  })();
}

// ── Category prefill from ?category= param (e.g. task CTA redirect) ──────────
if (!isEditMode) {
  const prefillCat = _urlParams.get("category");
  if (prefillCat && categoryEl.querySelector(`option[value="${prefillCat}"]`)) {
    categoryEl.value = prefillCat;
    onCategoryChange();
  }
}

// ── Method switching ──────────────────────────────────────────────────────────
cardManual.addEventListener("click", () => setMethod("manual"));
cardVisual.addEventListener("click", () => setMethod("visual"));
cardCbam?.addEventListener("click", () => setMethod("cbam"));

function setMethod(m) {
  currentMethod = m;
  cardManual.classList.toggle("active", m === "manual");
  cardVisual.classList.toggle("active", m === "visual");
  cardCbam?.classList.toggle("active", m === "cbam");
  uploadSection.style.display = m === "visual" ? "block" : "none";
  const upperRow = document.querySelector(".upper-row");
  const debugCol = document.querySelector(".debug-col");
  if (upperRow) upperRow.style.display = m === "cbam" ? "none" : "";
  if (debugCol) debugCol.style.display = m === "cbam" ? "none" : "";
  if (cbamSection) cbamSection.style.display = m === "cbam" ? "block" : "none";
  if (m === "cbam" && cePeriodEl?.value)
    cbamLoadPeriodEmissions(cePeriodEl.value);
  updateDebug();
}

// ── Category → activity dropdown ──────────────────────────────────────────────
categoryEl.addEventListener("change", onCategoryChange);

function onCategoryChange() {
  const cat = categoryEl.value;
  activityEl.innerHTML = "";

  if (!cat) {
    activityEl.innerHTML = '<option value="">Önce kategori seçin…</option>';
    setFormMode(null);
    resetCalc();
    updateDebug();
    return;
  }

  (ACTIVITY_MAP[cat] || []).forEach((a, i) => {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = a.label;
    if (i === 0) opt.selected = true;
    activityEl.appendChild(opt);
  });

  onActivityChange();
}

// ── Activity → unit dropdown + form mode ──────────────────────────────────────
activityEl.addEventListener("change", onActivityChange);

// Reset hesaplama sonucu kullanıcı herhangi bir alanı değiştirdiğinde
quantityEl.addEventListener("input", resetCalc);
unitSelect.addEventListener("change", resetCalc);
totalAmountEl.addEventListener("input", resetCalc);
originEl.addEventListener("input", resetCalc);
destEl.addEventListener("input", resetCalc);

function onActivityChange() {
  const cat = categoryEl.value;
  const actId = activityEl.value;
  if (!cat || !actId) return;

  const act = (ACTIVITY_MAP[cat] || []).find((a) => a.id === actId);
  if (!act) return;

  populateUnits(act.units);
  setFormMode(act.inputType);
  resetCalc();
  updateDebug();
}

function populateUnits(units) {
  unitSelect.innerHTML = "";
  units.forEach((u, i) => {
    const opt = document.createElement("option");
    opt.value = u;
    opt.textContent = u === "m3" ? "m³" : u === "TRY" ? "TRY (₺)" : u;
    if (i === 0) opt.selected = true;
    unitSelect.appendChild(opt);
  });
}

// Controls which input rows are shown and which fields are required.
function setFormMode(mode) {
  const qLabel = quantityRow.querySelector(".label");
  const aLabel = amountRow.querySelector(".label");

  switch (mode) {
    case "quantity":
      flightRow.style.display = "none";
      quantityRow.style.display = "block";
      amountRow.style.display = "none";
      quantityEl.required = true;
      totalAmountEl.required = false;
      totalAmountEl.value = "";
      if (qLabel) qLabel.textContent = "Miktar";
      break;

    case "spend":
      flightRow.style.display = "none";
      quantityRow.style.display = "none";
      amountRow.style.display = "block";
      quantityEl.required = false;
      totalAmountEl.required = true;
      quantityEl.value = "";
      if (aLabel) aLabel.textContent = "Toplam Tutar (TRY)";
      break;

    case "flight":
      flightRow.style.display = "block";
      quantityRow.style.display = "none";
      amountRow.style.display = "none";
      quantityEl.required = false;
      totalAmountEl.required = false;
      quantityEl.value = "";
      totalAmountEl.value = "";
      break;

    default:
      flightRow.style.display = "none";
      quantityRow.style.display = "none";
      amountRow.style.display = "none";
      quantityEl.required = false;
      totalAmountEl.required = false;
  }
}

// ── File upload + OCR ─────────────────────────────────────────────────────────
fileInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) startScan(file);
});

uploadZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadZone.classList.add("drag-over");
});
uploadZone.addEventListener("dragleave", () =>
  uploadZone.classList.remove("drag-over"),
);
uploadZone.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadZone.classList.remove("drag-over");
  const file = e.dataTransfer.files?.[0];
  if (file) startScan(file);
});

async function startScan(file) {
  if (file.size > 10 * 1024 * 1024) {
    showToast("Dosya Çok Büyük", "10 MB'dan küçük bir dosya seçin.", "error");
    return;
  }

  scanStatus.textContent = `"${file.name}" taranıyor…`;
  resetCalc();

  const isPdf = file.type === "application/pdf";

  try {
    if (isPdf) {
      // PDFs usually receipts or documents — use receipt pipeline
      await scanShoppingReceipt(file);
    } else {
      // For images: run OCR, inspect text for utility keywords and
      // either populate utility fields or fallback to shopping receipt parsing.
      await scanImageGeneric(file);
    }
  } catch (err) {
    scanStatus.textContent = `Hata: ${err.message}`;
    showToast("Tarama Hatası", err.message, "error");
  }
}

async function scanUtilityBill(file) {
  const base64 = await fileToBase64(file);
  const data = await emissionService.extractOcrFromImage(base64);
  console.log("[add-entry] utility OCR:", data);
  lastOcrData = { type: "utility", ...data };

  const ext = data.extracted;
  if (ext) {
    const mappedCat = normalizeCategory(ext.category);
    if (mappedCat && ACTIVITY_MAP[mappedCat] && !categoryEl.value) {
      categoryEl.value = mappedCat;
      onCategoryChange();
    }
    if (ext.quantity) {
      quantityEl.value = ext.quantity;
    }
    if (ext.unit) {
      for (const opt of unitSelect.options) {
        if (opt.value.toLowerCase() === ext.unit.toLowerCase()) {
          opt.selected = true;
          break;
        }
      }
    }
    if (ext.date) {
      entryDateEl.value = ext.date.length === 7 ? `${ext.date}-01` : ext.date;
    }
  }

  scanStatus.textContent =
    "Tarama tamamlandı — alanları doğrulayın, ardından hesaplayın.";
  showToast("Tarama Tamamlandı", "Alanlar dolduruldu.", "success");
  updateDebug({ ocrResult: data });
}

// Generic image OCR → Groq parsing → decide utility or shopping path
async function scanImageGeneric(file) {
  const base64 = await fileToBase64(file);
  const data = await emissionService.extractOcrFromImage(base64);
  console.log("[add-entry] image OCR:", data);
  lastOcrData = { type: "image", ...data };

  const ocrText = String(data.ocrText || "");
  console.log("OCR raw text:", ocrText);

  // Send OCR text to Groq for structured extraction; fallback to regex if it fails
  let groqResult = null;
  if (ocrText.length >= 10) {
    groqResult = await callGroqParser(ocrText);
  }
  console.log("Groq parsed data:", groqResult);

  // Local regex always runs — it is the authoritative shopping-signal check.
  const localCat = detectCategoryFromText(ocrText);
  console.log(
    "[scanImageGeneric] localCat=%s groqCategory=%s",
    localCat,
    groqResult?.category,
  );

  // Local regex overrides Groq for any non-null result (utility or shopping).
  // This prevents AI fuzzy-matching (e.g. "elektronik" → electricity on retail invoices)
  // and ensures genuine utility consumption signals always win.
  let groqCat = groqResult ? normalizeCategory(groqResult.category) : null;
  if (localCat !== null) {
    if (localCat !== groqCat) {
      console.log(
        "[scanImageGeneric] Local override: localCat=%s overrides groqCat=%s",
        localCat,
        groqCat,
      );
    }
    groqCat = localCat;
  }
  const detected = groqCat || localCat;
  console.log(
    "[scanImageGeneric] detectedCategory=%s reason=%s",
    detected,
    localCat !== null ? "local-regex" : "groq",
  );

  const isUtilityOrTransport =
    detected && ["energy", "water", "gas", "transport"].includes(detected);

  if (isUtilityOrTransport) {
    // ── Utility bill / Transport path ──────────────────
    categoryEl.value = detected;
    onCategoryChange();

    // Apply quantity/unit from Textract+AI extraction
    const ext = data.extracted;
    if (ext) {
      const mappedCat = normalizeCategory(ext.category);
      if (mappedCat && ACTIVITY_MAP[mappedCat]) {
        categoryEl.value = mappedCat;
        onCategoryChange();
      }

      // ── Fuel receipt handling ──────────────────────────────────
      // fuelType comes from Textract normalizeExpenseData or AI activity_type
      const fuelType =
        ext.fuelType || // from Textract path
        (ext.activity_type === "petrol_vehicle" ? "petrol" : null) ||
        (ext.activity_type === "diesel_vehicle" ? "diesel" : null);

      if (
        detected === "transport" &&
        fuelType &&
        ext.unit === "l" &&
        ext.quantity
      ) {
        // Set the volume-based fuel activity
        const fuelActivityId =
          fuelType === "petrol" ? "petrol_vehicle" : "diesel_vehicle";
        if (activityEl.querySelector(`option[value="${fuelActivityId}"]`)) {
          activityEl.value = fuelActivityId;
          activityEl.dispatchEvent(new Event("change", { bubbles: true }));
        }
        // Show litre→m³ conversion hint
        const litres = parseFloat(ext.quantity);
        const m3 = (litres / 1000).toFixed(4);
        if (fuelReceiptHint) {
          fuelReceiptHint.textContent = `Yakıt fişi algılandı: ${litres} L → ${m3} m³ olarak emisyon hesabına dönüştürüldü.`;
          fuelReceiptHint.style.display = "block";
        }
      } else if (fuelReceiptHint) {
        fuelReceiptHint.style.display = "none";
      }

      if (ext.quantity) {
        quantityEl.value = String(parseFloat(ext.quantity));
        quantityEl.dispatchEvent(new Event("input", { bubbles: true }));
      }
      if (ext.unit) {
        for (const opt of unitSelect.options) {
          if (opt.value.toLowerCase() === ext.unit.toLowerCase()) {
            opt.selected = true;
            break;
          }
        }
        unitSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }

    // Date: Groq takes priority over Textract extraction
    const dateStr = groqResult?.purchaseDate || ext?.date;
    if (dateStr) {
      entryDateEl.value = dateStr.length === 7 ? `${dateStr}-01` : dateStr;
      entryDateEl.dispatchEvent(new Event("change", { bubbles: true }));
    }

    scanStatus.textContent = groqResult
      ? "AI ile ayrıştırıldı — kaydetmeden önce kontrol edin."
      : "Tarama tamamlandı — alanları doğrulayın, ardından hesaplayın.";
    showToast("Tarama Tamamlandı", "Alanlar dolduruldu.", "success");
    updateDebug({ ocrResult: data, detectedCategory: detected, groqResult });
    return;
  }

  // ── Shopping / Food / receipt path ─────────────────────────────────────────────
  categoryEl.value = detected || "shopping";
  onCategoryChange();
  if (detected === "food") {
    // Select a 'spend' based food activity to trigger amountRow
    activityEl.value = "vegetables";
  } else {
    activityEl.value = "shopping_general";
  }
  onActivityChange(); // setFormMode('spend') → shows #amountRow

  if (groqResult?.totalAmount) {
    // Groq successfully extracted a monetary amount — fill fields directly.
    const amountInput = totalAmountEl;
    amountInput.value = String(parseFloat(groqResult.totalAmount));
    amountInput.dispatchEvent(new Event("input", { bubbles: true }));
    amountInput.dispatchEvent(new Event("change", { bubbles: true }));
    console.log("Amount input found:", amountInput);
    console.log("Amount value set to:", amountInput.value);

    if (groqResult.purchaseDate) {
      const d = groqResult.purchaseDate;
      entryDateEl.value = d.length === 7 ? `${d}-01` : d;
      entryDateEl.dispatchEvent(new Event("change", { bubbles: true }));
    }

    scanStatus.textContent =
      "AI ile ayrıştırıldı — kaydetmeden önce kontrol edin.";
    showToast("AI ile Ayrıştırıldı", "Tutarı ve tarihi doğrulayın.", "success");
    updateDebug({ ocrResult: data, groqResult });
    return;
  }

  // Fallback: delegate to receipt-specific OCR (Textract AnalyzeExpense)
  await scanShoppingReceipt(file);
}

// Calls the backend Groq endpoint and returns parsed data, or null on any failure
async function callGroqParser(ocrText) {
  try {
    const res = await fetch("/api/emissions/parse-ocr-groq", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TokenManager.get() || ""}`,
      },
      body: JSON.stringify({ ocrText }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.success ? json.data : null;
  } catch {
    return null;
  }
}

// Returns the ACTIVITY_MAP category key, 'shopping' for shopping signals, or null if unclear.
// Priority: electricity > water > gas > shopping > null
// Utility signals always win over shopping signals.
function detectCategoryFromText(text) {
  if (!text || typeof text !== "string") return null;
  const t = text.toLowerCase();

  // 1. Electricity — genuine consumption signals take highest priority.
  // e-fatura / e-arşiv / elektronik describe invoice FORMAT and must NEVER block this.
  const hasElecConsumption =
    /\bkwh\b|aktif enerji|enerji bedeli|elektrik fatura[sı]|elektrik tüketimi|tesisat no|sayaç no|dağıtım bedeli|tek zamanlı|\bpuant\b|gündüz.*endeks|gece.*endeks/i.test(
      t,
    );
  if (hasElecConsumption) {
    console.log("[detectCategoryFromText] reason=electricity_signals");
    return "energy";
  }
  if (
    /\belektrik\b/.test(t) &&
    /\bkwh\b|tüketim|sayaç|abonelik|tesisat/.test(t)
  ) {
    console.log("[detectCategoryFromText] reason=electricity_word_signal");
    return "energy";
  }

  // 2. Water — expanded signal set; "su" alone is too generic.
  const hasWater =
    /su fatura[sı]|su faturasi|su bedeli|atık su|atik su|toplam m[3³]|günlük m[3³]|su birim fiyat[ı]|su tüketimi/i.test(
      t,
    );
  if (hasWater) {
    console.log("[detectCategoryFromText] reason=water_signals");
    return "water";
  }
  if (/\bsu\b/.test(t) && /ödenecek tutar/i.test(t)) {
    console.log("[detectCategoryFromText] reason=water_payment_signal");
    return "water";
  }

  // 3. Natural gas
  const hasGas =
    /do[gğ]algaz|do[gğ]al\s+gaz|gaz fatura[sı]|\bsm3\b|standart metreküp|tüketim düzeltme/i.test(
      t,
    );
  if (hasGas) {
    console.log("[detectCategoryFromText] reason=gas_signals");
    return "gas";
  }
  if (/endeks/i.test(t) && /\bgaz\b/.test(t)) return "gas";
  if (/sayaç/i.test(t) && /\bgaz\b/.test(t)) return "gas";

  // 4. Transport & Fuel
  const hasTransport =
    /akaryak[ıi]t|benzin|motorin|lpg|otogaz|ta[şs][ıi]t tan[ıi]ma|yak[ıi]t|petrol|istasyon|kur[şs]unsuz/i.test(
      t,
    );
  if (hasTransport) {
    console.log("[detectCategoryFromText] reason=transport_signals");
    return "transport";
  }

  // 5. Food & Dining
  const hasFood =
    /restoran|lokanta|cafe|yemek|g[ıi]da|market|s[üu]permarket|f[ıi]r[ıi]n|pastane|kasap|manav|yiyecek|i[çc]ecek/i.test(
      t,
    );
  if (hasFood) {
    console.log("[detectCategoryFromText] reason=food_signals");
    return "food";
  }

  // 6. Shopping / e-commerce signals — only if no specific signal matched.
  // "birim fiyat" excluded: utility bills also contain unit pricing.
  const isShopping =
    /satış internet üzerinden|mağaza adı|sipariş no|kargo|kredi kartı|web adresi|mal hizmet|adet/i.test(
      t,
    );
  if (isShopping) {
    console.log("[detectCategoryFromText] reason=shopping_signals");
    return "shopping";
  }

  console.log("[detectCategoryFromText] reason=no_match");
  return null;
}

async function scanShoppingReceipt(file) {
  const formData = new FormData();
  formData.append("receipt", file);

  const res = await fetch("/api/ocr/shopping", {
    method: "POST",
    headers: { Authorization: `Bearer ${TokenManager.get() || ""}` },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Tarama başarısız.");

  console.log("[add-entry] shopping OCR:", data);
  lastOcrData = { type: "shopping", ...data };

  if (data.date)
    entryDateEl.value = data.date.length === 7 ? `${data.date}-01` : data.date;
  if (data.originalAmount) totalAmountEl.value = data.originalAmount;

  categoryEl.value = "shopping";
  onCategoryChange();

  // Shopping OCR already returns co2e — activate result immediately
  if (data.co2e && parseFloat(data.co2e) > 0) {
    calculatedCo2 = parseFloat(data.co2e);
    showResult(calculatedCo2);
    scanStatus.textContent = `Tarama tamamlandı — ${data.originalAmount} ${data.currency} → ${calculatedCo2.toFixed(3)} kg CO₂e`;
    showToast(
      "Tarama Tamamlandı",
      `${calculatedCo2.toFixed(3)} kg CO₂e hesaplandı.`,
      "success",
    );
    updateDebug({ ocrResult: data, co2e: calculatedCo2 });
    return;
  }

  scanStatus.textContent =
    "Tarama tamamlandı — tutarı doğrulayın, ardından hesaplayın.";
  showToast(
    "Tarama Tamamlandı",
    "Tutar dolduruldu, lütfen doğrulayın.",
    "success",
  );
  updateDebug({ ocrResult: data });
}

// ── Validation ────────────────────────────────────────────────────────────────
function currentInputType() {
  const cat = categoryEl.value;
  const actId = activityEl.value;
  if (!cat || !actId) return null;
  return (
    (ACTIVITY_MAP[cat] || []).find((a) => a.id === actId)?.inputType ?? null
  );
}

function validate() {
  setText("categoryError", "");
  setText("activityError", "");
  setText("dateError", "");
  let ok = true;

  if (!categoryEl.value) {
    setText("categoryError", "Lütfen bir kategori seçin.");
    ok = false;
  }
  if (categoryEl.value && !activityEl.value) {
    setText("activityError", "Lütfen faaliyet türü seçin.");
    ok = false;
  }

  const mode = currentInputType();

  if (mode === "quantity") {
    const qty = parseFloat(quantityEl.value);
    if (!Number.isFinite(qty) || qty <= 0) {
      showToast("Eksik Alan", "Lütfen geçerli bir miktar girin.", "error");
      ok = false;
    }
  } else if (mode === "spend") {
    const amt = parseFloat(totalAmountEl.value);
    if (!Number.isFinite(amt) || amt <= 0) {
      showToast("Eksik Alan", "Lütfen geçerli bir TRY tutarı girin.", "error");
      ok = false;
    }
  } else if (mode === "flight") {
    if (originEl.value.trim().length < 3 || destEl.value.trim().length < 3) {
      showToast(
        "Eksik Alan",
        "Kalkış ve varış bilgilerini girin (örn. IST, LHR).",
        "error",
      );
      ok = false;
    }
  }

  if (!entryDateEl.value) {
    setText("dateError", "Lütfen bir tarih seçin.");
    ok = false;
  }

  return ok;
}

// ── Build Climatiq payload ────────────────────────────────────────────────────
function buildPayload() {
  const cat = categoryEl.value;
  const actId = activityEl.value;
  const mode = currentInputType();
  const label =
    activityEl.options[activityEl.selectedIndex]?.textContent || actId;

  if (mode === "flight") {
    return {
      from: originEl.value.trim().toUpperCase(),
      to: destEl.value.trim().toUpperCase(),
    };
  }

  if (cat === "food" && !CLIMATIQ_MAP[actId]?.spendBased) {
    const rawQty = parseFloat(quantityEl.value);
    return {
      category: "food",
      activityType: actId,
      quantity: rawQty,
      unit: "kg",
      activityLabel: label,
    };
  }

  const climatiq = CLIMATIQ_MAP[actId];
  if (!climatiq)
    throw new Error(`"${label}" için Climatiq aktivite ID'si bulunamadı.`);

  // Yerel katsayı ile hesaplanan aktiviteler (Climatiq çağrısı yok)
  if (climatiq.localCoefficient != null) {
    const rawQty = parseFloat(quantityEl.value);
    return {
      localCoefficient: climatiq.localCoefficient,
      quantity: rawQty,
      unit: climatiq.apiUnit,
      activityLabel: label,
      category: cat,
    };
  }

  if (mode === "spend") {
    const tryAmt = parseFloat(totalAmountEl.value);
    const rate = lastOcrData?.exchangeRate
      ? parseFloat(lastOcrData.exchangeRate)
      : TRY_USD_FALLBACK;
    const spendPayload = {
      activityId: climatiq.activityId,
      quantity: parseFloat((tryAmt / rate).toFixed(4)),
      unit: "usd",
      activityLabel: label,
      category: cat,
    };
    console.log("[buildPayload] spend flow →", spendPayload);
    return spendPayload;
  }

  // quantity mode — apply unit conversion if needed (e.g. m³ → l for water, m³ → kWh for gas)
  const rawQty = parseFloat(quantityEl.value);
  const inUnit = unitSelect.value;
  const apiQty = climatiq.convert?.[inUnit]
    ? climatiq.convert[inUnit](rawQty)
    : rawQty;

  return {
    activityId: climatiq.activityId,
    quantity: parseFloat(apiQty.toFixed(6)),
    unit: climatiq.apiUnit,
    activityLabel: label,
    category: cat,
  };
}

// ── Calculate ─────────────────────────────────────────────────────────────────
calcBtn.addEventListener("click", runCalculate);

async function runCalculate() {
  if (!validate()) return;

  if (calcStatusEl) {
    calcStatusEl.className = "calc-status loading";
    calcStatusEl.textContent = "Karbon ayak izi hesaplanıyor…";
  }
  if (calcBtn) calcBtn.disabled = true;
  resultBanner?.classList.remove("visible");
  if (saveBtn) saveBtn.disabled = true;

  try {
    const payload = buildPayload();
    console.log("[add-entry] calculate payload:", payload);

    // Yerel katsayı → Climatiq çağrısı yok
    if ("localCoefficient" in payload) {
      calculatedCo2 = parseFloat(
        (payload.quantity * payload.localCoefficient).toFixed(6),
      );
      if (calcStatusEl) {
        calcStatusEl.className = "calc-status";
        calcStatusEl.textContent = "";
      }
      showResult(calculatedCo2);
      updateDebug({
        payload,
        co2e: calculatedCo2,
        method: "local_coefficient",
      });
      return;
    }

    const res = await fetch("/api/emissions/calculate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TokenManager.get() || ""}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok)
      throw new Error(data.message || `Hesaplama hatası (${res.status})`);

    calculatedCo2 = parseFloat(data.co2e);
    if (calcStatusEl) {
      calcStatusEl.className = "calc-status";
      calcStatusEl.textContent = "";
    }
    showResult(calculatedCo2);
    updateDebug({ payload, calcResult: data, co2e: calculatedCo2 });
  } catch (err) {
    if (calcStatusEl) {
      calcStatusEl.className = "calc-status error";
      calcStatusEl.textContent = `⚠ ${err.message}`;
    }
    showToast("Hesaplama Hatası", err.message, "error");
    updateDebug({ error: err.message });
  } finally {
    if (calcBtn) calcBtn.disabled = false;
  }
}

function showResult(co2) {
  if (resultCo2El) resultCo2El.textContent = co2.toFixed(3);
  resultBanner?.classList.add("visible");
  if (saveBtn) saveBtn.disabled = false;
}

// ── Save ──────────────────────────────────────────────────────────────────────
entryForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!calculatedCo2 || calculatedCo2 <= 0) {
    showToast("Hata", "Önce karbonu hesaplayın.", "error");
    return;
  }
  if (!entryDateEl.value) {
    document.getElementById("dateError").textContent =
      "Lütfen bir tarih seçin.";
    return;
  }

  const mode = currentInputType();
  const desc = descriptionEl.value.trim();
  const label = activityEl.options[activityEl.selectedIndex]?.textContent || "";
  const source =
    mode === "flight"
      ? `Uçuş: ${originEl.value.trim().toUpperCase()}-${destEl.value.trim().toUpperCase()}`
      : desc || label || categoryEl.value || "Diğer";

  saveBtn.disabled = true;
  saveBtn.textContent = "Kaydediliyor…";

  try {
    const saveMode = currentInputType();
    const payload = {
      source,
      amount: calculatedCo2,
      date: entryDateEl.value,
      category: categoryEl.value || null,
      activity_type: activityEl.value || null,
      quantity:
        saveMode === "quantity" ? parseFloat(quantityEl.value) || null : null,
      unit: saveMode === "quantity" ? unitSelect.value || null : null,
      totalAmountTRY:
        saveMode === "spend" ? parseFloat(totalAmountEl.value) || null : null,
      method: currentMethod,
    };

    let didLevelUp = false;
    let newLevel = null;

    if (isEditMode) {
      await emissionService.update(editId, payload);
      showToast("Güncellendi!", "Emisyon kaydı güncellendi.", "success");
    } else {
      await emissionService.create(payload);
      showToast("Kaydedildi!", "Emisyon kaydı oluşturuldu.", "success");

      // Mark today as logged (for daily reminder suppression)
      const todayKey = `gam_logged_${new Date().toISOString().slice(0, 10)}`;
      const isFirstEntryToday = !localStorage.getItem(todayKey);
      localStorage.setItem(todayKey, "1");

      // Award XP and show celebrations
      try {
        const gamResult = await gamificationService.processEntry();
        const gam = gamResult?.data;
        if (gam && gam.xpGained > 0) {
          showXpGain(gam.xpGained, saveBtn);
          if (gam.newBadges?.length > 0) {
            triggerConfetti();
            gam.newBadges.forEach((b) => showBadgeUnlock(b, showToast));
          }
          if (gam.leveledUp) {
            didLevelUp = true;
            newLevel = gam.stats.level;
          } else if (isFirstEntryToday && gam.stats?.streak >= 2) {
            showToast(
              `🔥 ${gam.stats.streak} günlük seri!`,
              "Harika gidiyorsun, devam et!",
              "success",
            );
          }
        } else if (gam && gam.xpGained === 0 && gam.stats) {
          showToast(
            "Günlük limit",
            "Bugün bu etkinlik için maksimum XP kazandın.",
            "info",
          );
        }
      } catch (gamErr) {
        console.warn("[gamification] awardXp failed:", gamErr?.message);
      }
    }

    if (didLevelUp) {
      // Redirect only after user dismisses the level-up popup
      setTimeout(() => {
        showLevelUp(newLevel, () => {
          window.location.href = "emissions.html";
        });
      }, 600);
    } else {
      setTimeout(() => {
        window.location.href = "emissions.html";
      }, 1800);
    }
  } catch (err) {
    showToast("Kayıt Hatası", err.message || "Kayıt yapılamadı.", "error");
    saveBtn.disabled = false;
    saveBtn.textContent = isEditMode ? "✔ Güncelle" : "✔ Onayla ve Kaydet";
  }
});

// ── Clear ─────────────────────────────────────────────────────────────────────
clearBtn?.addEventListener("click", () => {
  categoryEl.value = "";
  activityEl.innerHTML = '<option value="">Önce kategori seçin…</option>';
  originEl.value = "";
  destEl.value = "";
  quantityEl.value = "";
  totalAmountEl.value = "";
  entryDateEl.value = today;
  descriptionEl.value = "";
  fileInput.value = "";
  lastOcrData = null;
  scanStatus.textContent = "";
  setFormMode(null);
  resetCalc();
  updateDebug();
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function resetCalc() {
  calculatedCo2 = null;
  resultBanner?.classList.remove("visible");
  if (saveBtn) saveBtn.disabled = true;
  if (calcStatusEl) {
    calcStatusEl.className = "calc-status";
    calcStatusEl.textContent = "";
  }
}

function updateDebug(extra = {}) {
  const state = {
    method: currentMethod,
    category: categoryEl.value || "—",
    activityType: activityEl.value || "—",
    inputMode: currentInputType() || "—",
    quantity: quantityEl.value ? parseFloat(quantityEl.value) : null,
    unit: unitSelect.value,
    totalAmountTRY: totalAmountEl.value
      ? parseFloat(totalAmountEl.value)
      : null,
    co2e: calculatedCo2,
    date: entryDateEl.value || "—",
    description: descriptionEl.value || "—",
    ...extra,
  };
  if (debugOutput) debugOutput.textContent = JSON.stringify(state, null, 2);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Dosya okunamadı."));
    reader.readAsDataURL(file);
  });
}

// ── CBAM declaration form (company users only) ────────────────────────────────

const CBAM_RISK_THRESHOLDS = { medium: 10000, high: 50000, critical: 200000 };

function cbamClientRisk(cost) {
  if (cost < CBAM_RISK_THRESHOLDS.medium) return "low";
  if (cost < CBAM_RISK_THRESHOLDS.high) return "medium";
  if (cost < CBAM_RISK_THRESHOLDS.critical) return "high";
  return "critical";
}

let cbamPeriodState = {
  total_kg: null,
  monthly_prod_tons: null,
  carbon_price_default: null,
  auto_factor: null,
  has_records: false,
};
let _factorIsManual = false;
let _priceIsManual = false;

const ceCategoryEl = document.getElementById("ceCategory");
const cePeriodEl = document.getElementById("cePeriod");
const ceExportAmountEl = document.getElementById("ceExportAmount");
const ceDestinationEl = document.getElementById("ceDestinationRegion");
const ceDeclPaidPriceEl = document.getElementById("ceDeclPaidPrice");
const ceEmissionFactorEl = document.getElementById("ceEmissionFactor");
const ceCarbonPriceEl = document.getElementById("ceCarbonPrice");
const ceNotesEl = document.getElementById("ceNotes");
const ceSaveBtnEl = document.getElementById("ceSaveBtn");
const ceEmissionsInfoEl = document.getElementById("ceEmissionsInfo");
const ceEmissionsInfoContent = document.getElementById(
  "ceEmissionsInfoContent",
);
const ceFactorSourceBadge = document.getElementById("ceFactorSourceBadge");
const cePriceBadge = document.getElementById("cePriceBadge");
const previewFactorEl = document.getElementById("previewFactor");
const previewEmissionEl = document.getElementById("previewEmission");
const previewCostEl = document.getElementById("previewCost");
const previewRiskEl = document.getElementById("previewRisk");

async function cbamLoadCategoryDefaults(category) {
  if (!category) {
    if (!_factorIsManual) {
      if (ceEmissionFactorEl) ceEmissionFactorEl.value = "";
      if (ceFactorSourceBadge) ceFactorSourceBadge.innerHTML = "";
    }
    return;
  }
  try {
    const res = await companyService.getCbamDefaultFactor(category);
    const data = res.data || {};
    if (data.factor !== null && !_factorIsManual) {
      if (ceEmissionFactorEl) ceEmissionFactorEl.value = data.factor;
      if (ceFactorSourceBadge)
        ceFactorSourceBadge.innerHTML =
          '<span style="color:#16a34a;font-weight:700;">⟳ Otomatik (EU varsayılan)</span>';
      cbamUpdatePreview();
    }
  } catch {
    // silently skip — user can fill manually
  }
}

async function cbamLoadPeriodEmissions(period) {
  if (!period) {
    if (ceEmissionsInfoEl) ceEmissionsInfoEl.style.display = "none";
    cbamPeriodState = {
      total_kg: null,
      monthly_prod_tons: null,
      carbon_price_default: null,
      auto_factor: null,
      has_records: false,
    };
    cbamUpdatePreview();
    return;
  }

  if (ceEmissionsInfoEl) ceEmissionsInfoEl.style.display = "block";
  if (ceEmissionsInfoContent)
    ceEmissionsInfoContent.innerHTML =
      '<span style="color:var(--color-text-muted);">Yükleniyor…</span>';

  try {
    const res = await companyService.getPeriodEmissions(period);
    const data = res.data || {};

    const totalKg = parseFloat(data.total_kg ?? 0);
    const monthlyTons = data.monthly_prod_tons
      ? parseFloat(data.monthly_prod_tons)
      : null;
    const cpDefault = data.carbon_price_default
      ? parseFloat(data.carbon_price_default)
      : null;
    const hasRecords = totalKg > 0;

    let autoFactor = null;
    if (hasRecords) {
      const exportAmt = parseFloat(ceExportAmountEl?.value);
      const denom =
        monthlyTons ??
        (Number.isFinite(exportAmt) && exportAmt > 0 ? exportAmt : null);
      if (denom && denom > 0) autoFactor = totalKg / 1000 / denom;
    }

    cbamPeriodState = {
      total_kg: totalKg,
      monthly_prod_tons: monthlyTons,
      carbon_price_default: cpDefault,
      auto_factor: autoFactor,
      has_records: hasRecords,
    };

    const [y, m] = period.split("-");
    const label = new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString(
      "tr-TR",
      { year: "numeric", month: "long" },
    );

    // Always neutral/info styling — this box is supplementary, not the main calculation source
    ceEmissionsInfoEl.style.borderColor = "var(--color-border)";
    ceEmissionsInfoEl.style.background = "var(--color-surface)";

    let html = `<div style="font-weight:700;margin-bottom:4px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--color-text-muted);">Operasyonel emisyon özeti — ${label}</div>`;

    if (hasRecords) {
      html += `<div style="color:var(--color-text-secondary);">${(totalKg / 1000).toFixed(4)} tCO₂e kayıtlı operasyonel emisyon</div>`;
      if (monthlyTons)
        html += `<div style="color:var(--color-text-muted);">Aylık üretim: ${monthlyTons.toLocaleString("tr-TR", { maximumFractionDigits: 2 })} ton</div>`;
    } else {
      html += `<div style="color:var(--color-text-muted);">Bu dönemde kayıtlı operasyonel emisyon bulunmuyor.</div>`;
    }
    html += `<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--color-border);font-size:11px;color:var(--color-text-muted);">ℹ CBAM hesabı ürün bazlı emisyon faktörü üzerinden yapılır. Bu özet yalnızca bilgi amaçlıdır.</div>`;

    if (cpDefault !== null) {
      html += `<div style="color:var(--color-text-muted);margin-top:4px;font-size:12px;">Yapılandırılmış karbon fiyatı: <strong>€${cpDefault.toFixed(2)}/tCO₂</strong></div>`;
      if (!_priceIsManual) {
        if (ceCarbonPriceEl) ceCarbonPriceEl.value = cpDefault.toFixed(2);
        if (cePriceBadge)
          cePriceBadge.innerHTML =
            '<span style="color:#16a34a;font-weight:700;">⟳ Otomatik (yönetici yapılandırması)</span>';
      }
    }
    if (ceEmissionsInfoContent) ceEmissionsInfoContent.innerHTML = html;
  } catch {
    if (ceEmissionsInfoContent)
      ceEmissionsInfoContent.innerHTML =
        '<span style="color:var(--color-error);">⚠ Dönem bilgisi yüklenemedi.</span>';
  }

  cbamUpdatePreview();
}

function cbamUpdatePreview() {
  const manualFactor = parseFloat(ceEmissionFactorEl?.value);
  const effectiveFactor =
    Number.isFinite(manualFactor) && manualFactor > 0
      ? manualFactor
      : cbamPeriodState.auto_factor;

  if (cbamPeriodState.has_records && !cbamPeriodState.monthly_prod_tons) {
    const amt = parseFloat(ceExportAmountEl?.value);
    if (Number.isFinite(amt) && amt > 0)
      cbamPeriodState.auto_factor = cbamPeriodState.total_kg / 1000 / amt;
  }

  const amount = parseFloat(ceExportAmountEl?.value) || 0;
  const ef = effectiveFactor ?? 0;
  const manualPrice = parseFloat(ceCarbonPriceEl?.value);
  const price =
    Number.isFinite(manualPrice) && manualPrice >= 0
      ? manualPrice
      : (cbamPeriodState.carbon_price_default ?? 0);
  const paid = parseFloat(ceDeclPaidPriceEl?.value) || 0;

  const totalEm = amount * ef;
  const netP = Math.max(0, price - paid);
  const cost = totalEm * netP;
  const isManualFactor = Number.isFinite(manualFactor) && manualFactor > 0;

  if (ceFactorSourceBadge) {
    if (ef <= 0) {
      ceFactorSourceBadge.innerHTML = "";
    } else if (isManualFactor) {
      ceFactorSourceBadge.innerHTML =
        '<span style="color:#f59e0b;font-weight:700;">✎ Manuel</span>';
    } else if (
      cbamPeriodState.auto_factor !== null &&
      ef === cbamPeriodState.auto_factor
    ) {
      ceFactorSourceBadge.innerHTML =
        '<span style="color:#16a34a;font-weight:700;">⟳ Emisyon kayıtlarından türetildi</span>';
    }
    // If EU default was auto-filled, the badge is already set by cbamLoadCategoryDefaults
  }

  if (totalEm > 0 && ef > 0) {
    if (previewFactorEl) previewFactorEl.textContent = ef.toFixed(6);
    if (previewEmissionEl) previewEmissionEl.textContent = totalEm.toFixed(4);
    if (previewCostEl)
      previewCostEl.textContent =
        "€" +
        cost.toLocaleString("tr-TR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
    const risk = cbamClientRisk(cost);
    if (previewRiskEl) {
      previewRiskEl.textContent = RISK_LABELS[risk];
      previewRiskEl.style.color = RISK_COLORS[risk];
    }
  } else {
    if (previewFactorEl)
      previewFactorEl.textContent = ef > 0 ? ef.toFixed(6) : "—";
    if (previewEmissionEl) previewEmissionEl.textContent = "—";
    if (previewCostEl) previewCostEl.textContent = "—";
    if (previewRiskEl) {
      previewRiskEl.textContent = "—";
      previewRiskEl.style.color = "";
    }
  }
}

ceCategoryEl?.addEventListener("change", () => {
  _factorIsManual = false;
  cbamLoadCategoryDefaults(ceCategoryEl.value);
});
cePeriodEl?.addEventListener("change", () =>
  cbamLoadPeriodEmissions(cePeriodEl.value),
);

ceEmissionFactorEl?.addEventListener("input", () => {
  _factorIsManual = ceEmissionFactorEl.value.trim() !== "";
  if (!_factorIsManual && ceFactorSourceBadge) {
    // user cleared it — re-show EU default badge if category is set
    cbamLoadCategoryDefaults(ceCategoryEl?.value || "");
  } else if (_factorIsManual && ceFactorSourceBadge) {
    ceFactorSourceBadge.innerHTML =
      '<span style="color:#f59e0b;font-weight:700;">✎ Manuel</span>';
  }
  cbamUpdatePreview();
});

ceCarbonPriceEl?.addEventListener("input", () => {
  _priceIsManual = ceCarbonPriceEl.value.trim() !== "";
  if (cePriceBadge) {
    cePriceBadge.innerHTML = _priceIsManual
      ? '<span style="color:#f59e0b;font-weight:700;">✎ Manuel</span>'
      : '<span style="color:#16a34a;font-weight:700;">⟳ Otomatik (yönetici yapılandırması)</span>';
  }
  cbamUpdatePreview();
});

[ceExportAmountEl, ceDeclPaidPriceEl].forEach((el) => {
  el?.addEventListener("input", cbamUpdatePreview);
});

ceSaveBtnEl?.addEventListener("click", async () => {
  const category = ceCategoryEl?.value;
  const period = cePeriodEl?.value;
  const exportAmt = ceExportAmountEl?.value;

  if (!category) {
    showToast("Hata", "CBAM kategorisi seçilmelidir.", "error");
    ceCategoryEl?.focus();
    return;
  }
  if (!period) {
    showToast("Hata", "Dönem seçilmelidir.", "error");
    cePeriodEl?.focus();
    return;
  }
  if (!exportAmt || parseFloat(exportAmt) <= 0) {
    showToast("Hata", "İhracat miktarı pozitif olmalıdır.", "error");
    ceExportAmountEl?.focus();
    return;
  }

  const manualFactor = ceEmissionFactorEl?.value.trim();
  if (
    manualFactor &&
    (isNaN(parseFloat(manualFactor)) || parseFloat(manualFactor) <= 0)
  ) {
    showToast("Hata", "Manuel emisyon faktörü pozitif olmalıdır.", "error");
    ceEmissionFactorEl?.focus();
    return;
  }
  const manualPrice = ceCarbonPriceEl?.value.trim();
  if (
    manualPrice &&
    (isNaN(parseFloat(manualPrice)) || parseFloat(manualPrice) < 0)
  ) {
    showToast(
      "Hata",
      "Manuel karbon fiyatı sıfır veya pozitif olmalıdır.",
      "error",
    );
    ceCarbonPriceEl?.focus();
    return;
  }

  ceSaveBtnEl.disabled = true;
  ceSaveBtnEl.textContent = "Hesaplanıyor…";

  try {
    await companyService.createEntry({
      export_category: category,
      period_start: period + "-01",
      export_amount: exportAmt,
      destination_region: ceDestinationEl?.value.trim() || undefined,
      paid_carbon_price: ceDeclPaidPriceEl?.value || "0",
      emission_factor: manualFactor || undefined,
      carbon_price: manualPrice || undefined,
      notes: ceNotesEl?.value.trim() || undefined,
    });

    showToast(
      "Başarılı",
      "CBAM beyanı kaydedildi ve Emisyon Takibi'ne eklendi.",
      "success",
    );
    setTimeout(() => {
      window.location.href = "company-cbam.html";
    }, 1200);
  } catch (err) {
    showToast("Hata", err.message, "error");
    ceSaveBtnEl.disabled = false;
    ceSaveBtnEl.textContent = "Hesapla ve Kaydet";
  }
});

// Init CBAM period when section first becomes visible
if (cePeriodEl) {
  const now = new Date();
  cePeriodEl.max = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  cePeriodEl.value = cePeriodEl.max;
}
