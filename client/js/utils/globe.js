/**
 * globe.js — Three.js powered realistic 3D globe
 */

const GLOBE_HEALTH_LEVELS = [
  { max: 250,   color: 0x10b981, label: 'Ekolojik Kahraman 🌿', emoji: '🌍' },
  { max: 450,   color: 0x84cc16, label: 'Türkiye Ortalaması/Normal ✅', emoji: '🌎' },
  { max: 750,   color: 0xeab308, label: 'Limit Aşımı: Dikkat ⚠️', emoji: '🌏' },
  { max: 1200,  color: 0xf97316, label: 'Yüksek Kirlilik Uyarı', emoji: '⚠️' },
  { max: Infinity, color: 0xef4444, label: 'Kritik: Acil Azaltım!', emoji: '🔴' },
];


const renderers = new Map();

/**
 * Initialize or update a Three.js globe in a container
 */
export function updateGlobe(totalKg, {
  containerId = 'globeCanvasContainer',
  labelId     = 'globeStatusLabel',
  textId      = 'globeEmissionText',
} = {}) {
  const container = document.getElementById(containerId);
  const label     = document.getElementById(labelId);
  const text      = document.getElementById(textId);

  if (!container) return;

  const level = GLOBE_HEALTH_LEVELS.find(l => totalKg <= l.max) || GLOBE_HEALTH_LEVELS.at(-1);

  if (!renderers.has(containerId)) {
    initThreeJSGlobe(container, containerId, level, totalKg);
  } else {
    // 🔄 CANLI VERİ GÜNCELLEME: Animasyon döngüsü (animate) artık tüm görsel 
    // değişimleri (renk, ışık, atmosfer) bu değere göre otomatik yapıyor.
    renderers.get(containerId).currentKg = totalKg;
  }

  // Kritik durum halkası — son seviye (>1200 kg) kritik kabul edilir
  const isCritical = level === GLOBE_HEALTH_LEVELS.at(-1);
  container.classList.toggle('is-critical', isCritical);
  container.style.filter = isCritical
    ? 'drop-shadow(0 0 50px rgba(239,68,68,0.45))'
    : 'drop-shadow(0 0 50px rgba(16,185,129,0.2))';

  if (label) label.textContent = `${level.emoji} ${level.label}`;
  if (text) {
    text.textContent = totalKg > 0
      ? `${totalKg.toFixed(1)} kg CO₂e kayıt edildi`
      : 'Henüz emisyon kaydı yok';
  }
}

function initThreeJSGlobe(container, id, level, totalKg) {
  const width = container.clientWidth;
  const height = container.clientHeight;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
  camera.position.z = 3.8;

  const renderer = new THREE.WebGLRenderer({ 
    antialias: true, 
    alpha: true,
    powerPreference: "high-performance" 
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x000000, 0); 
  container.appendChild(renderer.domElement);

  // ☀️ IŞIKLANDIRMA: BAŞLANGIÇTA SAF BEYAZ
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
  sunLight.position.set(5, 3, 5);
  scene.add(sunLight);

  // Earth Geometry
  const geometry = new THREE.SphereGeometry(1, 64, 64);
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  
  const texture = loader.load('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg', () => {
    renderer.render(scene, camera);
  });

  const material = new THREE.MeshPhongMaterial({
    map: texture,
    specular: 0x222222, // Parlamalar da beyaz/gri olsun
    shininess: 5,
    color: 0xffffff,
    emissive: 0x000000, // Başlangıçta ışıma yok
    emissiveIntensity: 0
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.y = THREE.MathUtils.degToRad(160);
  mesh.rotation.z = THREE.MathUtils.degToRad(23.4);
  scene.add(mesh);

  // 🎇 ATMOSFER GÜNCELLEMESİ
  const glowGeometry = new THREE.SphereGeometry(1.01, 64, 64);
  const glowMaterial = new THREE.MeshPhongMaterial({
    color: totalKg > 600 ? 0xef4444 : 0x4488ff,
    transparent: true,
    opacity: 0.15,
    side: THREE.BackSide,
  });
  const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
  mesh.add(glowMesh);

  // Clouds layer
  const cloudsGeometry = new THREE.SphereGeometry(1.025, 64, 64);
  const cloudsTexture = loader.load('https://threejs.org/examples/textures/planets/earth_clouds_1024.png');
  const cloudsMaterial = new THREE.MeshPhongMaterial({
    map: cloudsTexture,
    transparent: true,
    opacity: 0.4,
  });
  const cloudsMesh = new THREE.Mesh(cloudsGeometry, cloudsMaterial);
  cloudsMesh.rotation.y = THREE.MathUtils.degToRad(160);
  cloudsMesh.rotation.z = THREE.MathUtils.degToRad(23.4);
  scene.add(cloudsMesh);

  const animate = () => {
    requestAnimationFrame(animate);
    
    const state = renderers.get(id);
    if (!state) return;

    mesh.rotation.y += 0.001;
    cloudsMesh.rotation.y += 0.0014; 

    // 🌍 CANLI GÖRSEL GÜNCELLEME (Renk ve Sağlık Durumu)
    const currentKg = state.currentKg || 0;
    
    // Dünyanın "ölme" faktörü
    const factor = Math.max(0, 1 - (currentKg / 900));
    const r = 0.5 + 0.5 * factor;
    const g = 0.3 + 0.7 * factor;
    const b = 0.2 + 0.8 * factor;
    mesh.material.color.setRGB(r, g, b);

    // Işık şiddeti
    sunLight.intensity = 0.5 + 0.8 * factor;
    ambientLight.intensity = 0.4 + 0.6 * factor;

    // Atmosfer ve Bulutlar (Sera etkisi simülasyonu)
    if (glowMesh) {
      const activeLevel = GLOBE_HEALTH_LEVELS.find(l => currentKg <= l.max) || GLOBE_HEALTH_LEVELS.at(-1);
      glowMesh.material.color.setHex(activeLevel.color);
      
      // Kirlilik arttıkça sera gazı katmanı kalınlaşır (scale) ve yoğunlaşır (opacity)
      const scaleFactor = 1.01 + 0.04 * Math.min(1, currentKg / 1000);
      glowMesh.scale.set(scaleFactor, scaleFactor, scaleFactor);
      
      const baseOpacity = 0.12 + 0.18 * Math.min(1, currentKg / 1000);
      glowMesh.material.opacity = baseOpacity + Math.sin(Date.now() * 0.003) * 0.05;
    }

    if (cloudsMesh) {
      // Kirlilik arttıkça bulutlar grileşir ve kararır
      const cloudTone = Math.max(0.35, 1.0 - (currentKg / 1200) * 0.65);
      cloudsMesh.material.color.setRGB(cloudTone, cloudTone, cloudTone);
    }


    renderer.render(scene, camera);
  };

  animate();
  renderers.set(id, { scene, camera, renderer, mesh, cloudsMesh, sunLight, ambientLight, glowMesh, currentKg: totalKg });
}


export function updateGlobeTooltip({ currentMonth = 0, lastMonth = 0, total = 0 } = {}) {
  const elCurrent = document.getElementById('tooltipCurrentMonth');
  const elLast    = document.getElementById('tooltipLastMonth');
  const elChange  = document.getElementById('tooltipChange');
  const elTotal   = document.getElementById('tooltipTotal');

  if (!elCurrent) return;

  elCurrent.textContent = `${currentMonth.toFixed(1)} kg CO₂e`;
  elLast.textContent    = lastMonth > 0 ? `${lastMonth.toFixed(1)} kg CO₂e` : 'Veri yok';
  elTotal.textContent   = `${total.toFixed(1)} kg CO₂e`;

  if (lastMonth > 0 && currentMonth > 0) {
    const diff    = currentMonth - lastMonth;
    const pct     = Math.abs(Math.round((diff / lastMonth) * 100));
    const better  = diff < 0;
    elChange.textContent  = better ? `↓ %${pct} daha iyi 🎉` : `↑ %${pct} arttı`;
    elChange.style.color  = better ? '#10b981' : '#ef4444';
  } else {
    elChange.textContent = '—';
    elChange.style.color = 'var(--color-text-muted)';
  }
}

export function buildGlobeStats(records = []) {
  const now        = new Date();
  const thisMonth  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastDate   = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth  = `${lastDate.getFullYear()}-${String(lastDate.getMonth() + 1).padStart(2, '0')}`;

  let currentMonth = 0;
  let lastMonth    = 0;
  let total        = 0;

  records.forEach(r => {
    const amount = parseFloat(r.amount) || 0;
    const month  = (r.date || '').slice(0, 7);
    total += amount;
    if (month === thisMonth) currentMonth += amount;
    if (month === prevMonth)  lastMonth    += amount;
  });

  return { currentMonth, lastMonth, total };
}
