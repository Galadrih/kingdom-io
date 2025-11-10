const socket = io();

// HTML Elemanları
const classSelection = document.getElementById("classSelection");
const startGameBtn = document.getElementById("startGameBtn");
const creationScreen = document.getElementById("creationScreen");
const gameWorld = document.getElementById("gameWorld");
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const loginScreen = document.getElementById("loginScreen");
const loginBtn = document.getElementById("loginBtn");
const showRegisterBtn = document.getElementById("showRegisterBtn");
const registerForm = document.getElementById("registerForm");
const registerBtn = document.getElementById("registerBtn");
const characterSelectionScreen = document.getElementById("characterSelectionScreen");
const characterListEl = document.getElementById("characterList");
const createCharBtn = document.getElementById("createCharBtn");
const selectCharBtn = document.getElementById("selectCharBtn");
const chatContainer = document.getElementById("chatContainer");
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const inventoryPanel = document.getElementById("inventoryPanel");
const characterPanel = document.getElementById("characterPanel");
const skillPanel = document.getElementById("skillPanel");
const blacksmithPanel = document.getElementById("blacksmithPanel");
const upgradeSlot = document.getElementById("upgradeSlot");
const upgradeItemName = document.getElementById("upgradeItemName");
const upgradeCost = document.getElementById("upgradeCost");
const upgradeSuccessChance = document.getElementById("upgradeSuccessChance");
const upgradeButton = document.getElementById("upgradeButton");
let itemInUpgradeSlot = null; // { index: <invIndex>, item: <itemObj> }
const targetPlayerMenu = document.getElementById("targetPlayerMenu");
const targetPlayerName = document.getElementById("targetPlayerName");
const targetPlayerMenuCloseBtn = document.getElementById("targetPlayerMenuCloseBtn");
const targetActionWhisper = document.getElementById("targetActionWhisper");
const targetActionInvite = document.getElementById("targetActionInvite");
const targetActionTrade = document.getElementById("targetActionTrade");
let selectedTargetPlayerId = null; // Tıkladığımız oyuncunun ID'sini tutar
// --- YENİ: TİCARET DOM ELEMANLARI ---
const tradeRequestPanel = document.getElementById("tradeRequestPanel");
const tradeRequestMessage = document.getElementById("tradeRequestMessage");
const tradeRequestAccept = document.getElementById("tradeRequestAccept");
const tradeRequestDecline = document.getElementById("tradeRequestDecline");

const tradePanel = document.getElementById("tradePanel");
const tradeCancelBtn = document.getElementById("tradeCancelBtn");
const myTradeName = document.getElementById("myTradeName");
const myTradeStatus = document.getElementById("myTradeStatus");
const myTradeGrid = document.getElementById("myTradeGrid");
const myTradeYang = document.getElementById("myTradeYang");

const opponentTradeName = document.getElementById("opponentTradeName");
const opponentTradeStatus = document.getElementById("opponentTradeStatus");
const opponentTradeGrid = document.getElementById("opponentTradeGrid");
const opponentTradeYang = document.getElementById("opponentTradeYang");

const tradeAcceptBtn = document.getElementById("tradeAcceptBtn");
const tradeConfirmStatus = document.getElementById("tradeConfirmStatus");

let currentTradeSession = null; // Aktif ticaret oturumunu (ID, teklifler vb.) tutar
let currentTradeRequesterId = null; // Mevcut ticaret davetini kimden aldık?

const partyPanel = document.getElementById("partyPanel");
const partyMemberList = document.getElementById("partyMemberList");
const partyLeaveBtn = document.getElementById("partyLeaveBtn");
const partyInvitePanel = document.getElementById("partyInvitePanel");
const partyInviteAccept = document.getElementById("partyInviteAccept");
const partyInviteDecline = document.getElementById("partyInviteDecline");
let myParty = null; // Mevcut parti verimizi burada tutacağız
let currentInviterId = null; // Mevcut davetiyeyi kimden aldık?

const accountNameInput = document.getElementById("accountNameInput");
const passwordInput = document.getElementById("passwordInput");
const registerPasswordConfirm = document.getElementById("registerPasswordConfirm");

// MINIMAP CANVAS
const miniCanvas = document.getElementById("miniMap");
const miniCtx = miniCanvas ? miniCanvas.getContext("2d") : null;

const playerNameInput = document.getElementById("playerNameInput");
const kingdomSelection = document.getElementById("kingdomSelection");


let notificationTimer = null;
let warnPanelTimer = null; 
let playerChoices = { name: "", kingdom: "", class: "" };
let lastInventoryState = "[]";
let lastEquipmentState = "{}";

const ACTION_SLOT_KEYS = ['1', '2', '3', '4', '5', '6']; 
let actionBarSlots = [null, null, null, null, null, null]; 
let draggedSkillId = null; 

let globalPotCooldownEnd = 0; 
let cooldownAnimationId = null;
const POT_COOLDOWN_DURATION = 1000; 

// --- YENİ/GÜNCEL DEĞİŞKENLER ---
let inputListenersInitialized = false; 
let selectedCharacterName = null; // KRİTİK: Seçilen karakter adını tutar
const MAX_CHAR_SLOTS = 2;
// --- YENİ KOD SONU ---

// --------------------------- PLAYER STATS ---------------------------
let playerStats = {
    level: 1,
    hp: 100, maxHp: 100,
    mp: 50, maxMp: 50,
    exp: 0, maxExp: 100,
    yang: 0 
};

/**
 * İki obje arasındaki merkezden merkeze uzaklığı hesaplar.
 */
function distance(a, b) {
  const centerX_A = a.x + a.width / 2;
  const centerY_A = a.y + a.height / 2;
  const centerX_B = b.x + b.width / 2;
  const centerY_B = b.y + b.height / 2;
  
  const dx = centerX_A - centerX_B;
  const dy = centerY_A - centerY_B;
  
  return Math.sqrt(dx * dx + dy * dy);
}

// YENİ: HANGİ SINIFIN HANGİ BECERİ SEÇENEKLERİNE SAHİP OLDUĞUNU BELİRTEN HARİTA
const SKILL_SET_OPTIONS = {
    warrior: [
        { key: "body", name: "Bedensel Savaşçı", desc: "Saldırı gücüne ve hıza odaklanır." },
        { key: "mental", name: "Zihinsel Savaşçı", desc: "Güçlü savunmaya ve alan etkili saldırılara odaklanır." }
    ],
    ninja: [
        { key: "assassin", name: "Yakın Dövüş (Suikastçı)", desc: "Hızlı, tek hedefe yönelik bıçak saldırıları." },
        { key: "archer", name: "Uzak Dövüş (Okçu)", desc: "Yay kullanarak uzaktan hasar verir." }
    ],
    sura: [
        { key: "weaponry", name: "Büyülü Silah", desc: "Kılıcını büyüyle güçlendirir ve destek büyüleri kullanır." },
        { key: "black_magic", name: "Kara Büyü", desc: "Saldırı odaklý karanlık büyüler kullanır." }
    ],
    shaman: [
        { key: "dragon", name: "Ejderha Gücü (Destek)", desc: "Grup üyelerine kritik ve saldırı bonusları verir." },
        { key: "heal", name: "İyileştirme (Saldırı/Destek)", desc: "İyileştirme ve şimşek büyüleri kullanır." }
    ],
    lycan: [
        { key: "instinct", name: "İçgüdü", desc: "Lycan'lar tek bir saldırı yolunda uzmanlaşır." }
    ]
};


// YENİ: BECERİ İSİMLERİ VE İKONLARI İÇİN CLIENT VERİTABANI (Kısaltıldı)
const CLIENT_SKILL_DB = {
    "warrior_1_1": { name: "Üç Yönlü Kesme", icon: "/assets/skills/warrior_1_1.png" },
    "warrior_1_2": { name: "Hava Kılıcı", icon: "/assets/skills/warrior_1_2.png" },
    "warrior_1_3": { name: "Kılıç Çevirme", icon: "/assets/skills/warrior_1_3.png" },
    "warrior_1_4": { name: "Öfke", icon: "/assets/skills/warrior_1_4.png" },
    "warrior_1_5": { name: "Hamle", icon: "/assets/skills/warrior_1_5.png" },
    "warrior_2_1": { name: "Güçlü Beden", icon: "/assets/skills/warrior_2_1.png" },
    "warrior_2_2": { name: "Ruh Vuruşu", icon: "/assets/skills/warrior_2_2.png" },
    "warrior_2_3": { name: "Şiddetli Vuruş", icon: "/assets/skills/warrior_2_3.png" },
    "warrior_2_4": { name: "Kılıç Darbesi", icon: "/assets/skills/warrior_2_4.png" },
    "warrior_2_5": { name: "Güçlü Vuruş", icon: "/assets/skills/warrior_2_5.png" },
    "ninja_1_1": { name: "Suikast", icon: "/assets/skills/ninja_1_1.png" },
    "ninja_1_2": { name: "Hızlı Saldırı", icon: "/assets/skills/ninja_1_2.png" },
    "ninja_1_3": { name: "Bıçak Çevirme", icon: "/assets/skills/ninja_1_3.png" },
    "ninja_1_4": { name: "Zehirli Bulut", icon: "/assets/skills/ninja_1_4.png" },
    "ninja_1_5": { name: "Kamuflaj", icon: "/assets/skills/ninja_1_5.png" },
    "ninja_2_1": { name: "Ateşli Ok", icon: "/assets/skills/ninja_2_1.png" },
    "ninja_2_2": { name: "Zehirli Ok", icon: "/assets/skills/ninja_2_2.png" },
    "ninja_2_3": { name: "Ok Yağmuru", icon: "/assets/skills/ninja_2_3.png" },
    "ninja_2_4": { name: "Tekrarlanan Atış", icon: "/assets/skills/ninja_2_4.png" },
    "ninja_2_5": { name: "Hafif Adım", icon: "/assets/skills/ninja_2_5.png" },
    "sura_1_1": { name: "Büyülü Keskinlik", icon: "/assets/skills/sura_1_1.png" },
    "sura_1_2": { name: "Büyülü Zırh", icon: "/assets/skills/sura_1_2.png" },
    "sura_1_3": { name: "Dehşet", icon: "/assets/skills/sura_1_3.png" },
    "sura_1_4": { name: "Parmak Darbesi", icon: "/assets/skills/sura_1_4.png" },
    "sura_1_5": { name: "Ejderha Dönüşü", icon: "/assets/skills/sura_1_5.png" },
    "sura_2_1": { name: "Karanlık Koruma", icon: "/assets/skills/sura_2_1.png" },
    "sura_2_2": { name: "Ateş Hayaleti", icon: "/assets/skills/sura_2_2.png" },
    "sura_2_3": { name: "Karanlık Küre", icon: "/assets/skills/sura_2_3.png" },
    "sura_2_4": { name: "Hayalet Vuruş", icon: "/assets/skills/sura_2_4.png" },
    "sura_2_5": { name: "Karanlık Vuruş", icon: "/assets/skills/sura_2_5.png" },
    "shaman_1_1": { name: "Ejderha Kükremesi", icon: "/assets/skills/shaman_1_1.png" },
    "shaman_1_2": { name: "Uçan Tılsım", icon: "/assets/skills/shaman_1_2.png" },
    "shaman_1_3": { name: "Yansıtma", icon: "/assets/skills/shaman_1_3.png" },
    "shaman_1_4": { name: "Ejderha Yardımı", icon: "/assets/skills/shaman_1_4.png" },
    "shaman_1_5": { name: "Kutsama", icon: "/assets/skills/shaman_1_5.png" },
    "shaman_2_1": { name: "Şimşek Atma", icon: "/assets/skills/shaman_2_1.png" },
    "shaman_2_2": { name: "Şimşek Çağırma", icon: "/assets/skills/shaman_2_2.png" },
    "shaman_2_3": { name: "Şimşek Pençesi", icon: "/assets/skills/shaman_2_3.png" },
    "shaman_2_4": { name: "Tedavi", icon: "/assets/skills/shaman_2_4.png" },
    "shaman_2_5": { name: "Yüksek Hız", icon: "/assets/skills/shaman_2_5.png" },
    "lycan_1_1": { name: "Kurt Pençesi", icon: "/assets/skills/lycan_1_1.png" },
    "lycan_1_2": { name: "Kurt Nefesi", icon: "/assets/skills/lycan_1_2.png" },
    "lycan_1_3": { name: "Yırtma", icon: "/assets/skills/lycan_1_3.png" },
    "lycan_1_4": { name: "Kurt Ruhu", icon: "/assets/skills/lycan_1_4.png" },
    "lycan_1_5": { name: "Kızıl Kurt Ruhu", icon: "/assets/skills/lycan_1_5.png" }
};



// --------------------------- ENVANTER & EKİPMAN ---------------------------
let inventory = Array(25).fill(null);
let equipment = {
    weapon: null, helmet: null, armor: null, shield: null,
    necklace: null, earring: null, bracelet: null, shoes: null
};

// SVG ICONS ve ITEM_DB, shop db'leriniz aynı kaldı
// ... (client.js'in 300. satırına kadarki SVG ICONS ve ITEM_DB kodları buraya dahil edilmiştir)

const SVG_ICONS = {
  "Sword": `<svg viewBox="0 0 24 24" fill="#FFD700" stroke="#8B4513" stroke-width="2"><path d="M2 22l2-2h16l2 2M12 2L2 12l10 10 10-10L12 2z"/></svg>`,
  "Helmet": `<svg viewBox="0 0 24 24" fill="#C0C0C0" stroke="#666" stroke-width="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8 0-1.1.22-2.14.6-3.1L12 16l7.4-7.1C18.78 9.86 18.56 10.9 18.56 12c0 4.41-3.59 8-8 8z"/></svg>`,
  "Chestplate": `<svg viewBox="0 0 24 24" fill="#8B4513" stroke="#DAA520" stroke-width="2"><path d="M12 2L2 12h3v8h14v-8h3L12 2zm0 2.83L18.17 11H14v7h-4v-7H5.83L12 4.83z"/></svg>`,
  "Shield": `<svg viewBox="0 0 24 24" fill="#4169E1" stroke="#1E90FF" stroke-width="2"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>`,
  "Necklace": `<svg viewBox="0 0 24 24" fill="#FFD700" stroke="#DAA520" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6" fill="#8B4513"/></svg>`,
  "Earring": `<svg viewBox="0 0 24 24" fill="#00CED1" stroke="#20B2AA" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4" fill="#FFF"/></svg>`,
  "Bracelet": `<svg viewBox="0 0 24 24" fill="#DC143C" stroke="#B22222" stroke-width="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>`,
  "Boots": `<svg viewBox="0 0 24 24" fill="#8B4513" stroke="#A0522D" stroke-width="2"><path d="M16 16c0-1.1-.9-2-2-2h-4c-1.1 0-2 .9-2 2v2h8v-2zm-4-8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 12c-2.21 0-4-1.79-4-4h8c0 2.21-1.79 4-4 4z"/></svg>`,
  "Question": `<svg viewBox="0 0 24 24" fill="#FFF" stroke="#FFF" stroke-width="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2V7zm0 8h2v2h-2v-2z"/></svg>`
};

const ITEM_DB = {
   
    // --- Ortak Aksesuarlar ---
    101: { id: 101, name: "Gümüş Kolye", type: "necklace", icon: "Necklace", hp: 50, requiredLevel: 1, iconSrc: "accessory_necklace_1.png", sellPrice: 200 },
    102: { id: 102, name: "Zümrüt Küpe", type: "earring", icon: "Earring", mp: 30, requiredLevel: 1, iconSrc: "accessory_earring_1.png", sellPrice: 150 },
    103: { id: 103, name: "Güç Bileziği", type: "bracelet", icon: "Bracelet", dmg: 10, requiredLevel: 1, iconSrc: "accessory_bracelet_1.png", sellPrice: 250 },
    104: { id: 104, name: "Hız Ayakkabıları", type: "shoes", icon: "Boots", speed: 2, requiredLevel: 1, iconSrc: "accessory_shoes_1.png", sellPrice: 300 },
    105: { id: 105, name: "Küçük Kalkan", type: "shield", icon: "Shield", def: 3, requiredLevel: 1, iconSrc: "accessory_shield_1.png", sellPrice: 350 },
    
    // =========================================================================
    // --- YENİ/GÜNCELLENMİŞ TÜKETİM EŞYALARI (POTLAR) ---
    // =========================================================================
    // Kırmızı Potlar (HP)
    9001: { id: 9001, name: "Kırmızı Pot (K)", type: "consumable", icon: "Potion", requiredLevel: 1, restoreHp: 300, buyPrice: 100, sellPrice: 10, iconSrc: "red_elixir_1.png" },
    9002: { id: 9002, name: "Kırmızı Pot (O)", type: "consumable", icon: "Potion", requiredLevel: 1, restoreHp: 800, buyPrice: 250, sellPrice: 25, iconSrc: "red_elixir_2.png" },
    9003: { id: 9003, name: "Kırmızı Pot (B)", type: "consumable", icon: "Potion", requiredLevel: 1, restoreHp: 1200, buyPrice: 450, sellPrice: 45, iconSrc: "red_elixir_3.png" },
    9004: { id: 9004, name: "Kırmızı Pot (XXL)", type: "consumable", icon: "Potion", requiredLevel: 1, restoreHp: 2400, buyPrice: 900, sellPrice: 90, iconSrc: "red_elixir_4.png" },
    
    // Mavi Potlar (MP)
    9011: { id: 9011, name: "Mavi Pot (K)", type: "consumable", icon: "Potion", requiredLevel: 1, restoreMp: 100, buyPrice: 120, sellPrice: 12, iconSrc: "blue_elixir_1.png" },
    9012: { id: 9012, name: "Mavi Pot (O)", type: "consumable", icon: "Potion", requiredLevel: 1, restoreMp: 250, buyPrice: 300, sellPrice: 30, iconSrc: "blue_elixir_2.png" },
    9013: { id: 9013, name: "Mavi Pot (B)", type: "consumable", icon: "Potion", requiredLevel: 1, restoreMp: 400, buyPrice: 550, sellPrice: 55, iconSrc: "blue_elixir_3.png" },
    9014: { id: 9014, name: "Mavi Pot (XXL)", type: "consumable", icon: "Potion", requiredLevel: 1, restoreMp: 800, buyPrice: 1100, sellPrice: 110, iconSrc: "blue_elixir_4.png" },
    
    // Yığın (Stack) Versiyonları (Mağaza için)
    // Kırmızı Pot (K) Yığınları
    9101: { id: 9101, name: "Kırmızı Pot (K) x50", type: "consumable", requiredLevel: 1, stackSize: 50, restoreHp: 300, buyPrice: 100 * 50 * 0.95, sellPrice: 10, iconSrc: "red_elixir_1.png" },
    9102: { id: 9102, name: "Kırmızı Pot (K) x100", type: "consumable", requiredLevel: 1, stackSize: 100, restoreHp: 300, buyPrice: 100 * 100 * 0.9, sellPrice: 10, iconSrc: "red_elixir_1.png" },
    9103: { id: 9103, name: "Kırmızı Pot (K) x200", type: "consumable", requiredLevel: 1, stackSize: 200, restoreHp: 300, buyPrice: 100 * 200 * 0.85, sellPrice: 10, iconSrc: "red_elixir_1.png" },
    // Mavi Pot (K) Yığınları
    9111: { id: 9111, name: "Mavi Pot (K) x50", type: "consumable", requiredLevel: 1, stackSize: 50, restoreMp: 100, buyPrice: 120 * 50 * 0.95, sellPrice: 12, iconSrc: "blue_elixir_1.png" },
    9112: { id: 9112, name: "Mavi Pot (K) x100", type: "consumable", requiredLevel: 1, stackSize: 100, restoreMp: 100, buyPrice: 120 * 100 * 0.9, sellPrice: 12, iconSrc: "blue_elixir_1.png" },
    9113: { id: 9113, name: "Mavi Pot (K) x200", type: "consumable", requiredLevel: 1, stackSize: 200, restoreMp: 100, buyPrice: 120 * 200 * 0.85, sellPrice: 12, iconSrc: "blue_elixir_1.png" },
    
    // --- SAVAŞÇI EŞYALARI ---
    1001: { id: 1001, name: "Geniş Mızrak", type: "weapon", icon: "Sword", dmg: 20, forClass: "warrior", requiredLevel: 1, iconSrc: "warrior_weapon_1.png" },
    1002: { id: 1002, name: "Mızrak", type: "weapon", icon: "Sword", dmg: 25, forClass: "warrior", requiredLevel: 5, iconSrc: "warrior_weapon_2.png" },
    1003: { id: 1003, name: "Giyotin Pala", type: "weapon", icon: "Sword", dmg: 30, forClass: "warrior", requiredLevel: 10, iconSrc: "warrior_weapon_3.png" },
    1004: { id: 1004, name: "Örümcek Mızrağı", type: "weapon", icon: "Sword", dmg: 35, forClass: "warrior", requiredLevel: 15, iconSrc: "warrior_weapon_4.png" },
    1005: { id: 1005, name: "Kargı", type: "weapon", icon: "Sword", dmg: 40, forClass: "warrior", requiredLevel: 20, iconSrc: "warrior_weapon_5.png" },
    1006: { id: 1006, name: "Savaş Tırpanı", type: "weapon", icon: "Sword", dmg: 45, forClass: "warrior", requiredLevel: 25, iconSrc: "warrior_weapon_6.png" },
    1007: { id: 1007, name: "Kırmızı Demir Pala", type: "weapon", icon: "Sword", dmg: 55, forClass: "warrior", requiredLevel: 30, iconSrc: "warrior_weapon_7.png" },
    1008: { id: 1008, name: "Baltalı Mızrak", type: "weapon", icon: "Sword", dmg: 60, forClass: "warrior", requiredLevel: 36, iconSrc: "warrior_weapon_8.png" },
    1009: { id: 1009, name: "Büyük Balta", type: "weapon", icon: "Sword", dmg: 70, forClass: "warrior", requiredLevel: 40, iconSrc: "warrior_weapon_9.png" },
    1010: { id: 1010, name: "Buzlu Uç", type: "weapon", icon: "Sword", dmg: 80, forClass: "warrior", requiredLevel: 45, iconSrc: "warrior_weapon_10.png" },
    1100: { id: 1100, name: "Kaplan Plaka Zırh", type: "armor", icon: "Chestplate", def: 15, forClass: "warrior", requiredLevel: 1 },
    1101: { id: 1101, name: "Deri Kask", type: "helmet", icon: "Helmet", def: 5, forClass: "warrior", requiredLevel: 1 },

    // --- SURA EŞYALARI ---
    2001: { id: 2001, name: "Kılıç", type: "weapon", icon: "Sword", dmg: 20, forClass: "sura", requiredLevel: 1, iconSrc: "sura_weapon_1.png" },
    2002: { id: 2002, name: "Uzun Kılıç", type: "weapon", icon: "Sword", dmg: 25, forClass: "sura", requiredLevel: 5, iconSrc: "sura_weapon_2.png" },
    2003: { id: 2003, name: "Hilal Kılıç", type: "weapon", icon: "Sword", dmg: 30, forClass: "sura", requiredLevel: 10, iconSrc: "sura_weapon_3.png" },
    2004: { id: 2004, name: "Bambu Kılıcı", type: "weapon", icon: "Sword", dmg: 35, forClass: "sura", requiredLevel: 15, iconSrc: "sura_weapon_4.png" },
    2005: { id: 2005, name: "Geniş Kılıç", type: "weapon", icon: "Sword", dmg: 40, forClass: "sura", requiredLevel: 20, iconSrc: "sura_weapon_5.png" },
    2006: { id: 2006, name: "Gümüş Kılıç", type: "weapon", icon: "Sword", dmg: 45, forClass: "sura", requiredLevel: 25, iconSrc: "sura_weapon_6.png" },
    2007: { id: 2007, name: "Dolunay Kılıcı", type: "weapon", icon: "Sword", dmg: 55, forClass: "sura", requiredLevel: 30, iconSrc: "sura_weapon_7.png" },
    2008: { id: 2008, name: "Sahte Kılıç", type: "weapon", icon: "Sword", dmg: 60, forClass: "sura", requiredLevel: 36, iconSrc: "sura_weapon_8.png" },
    2009: { id: 2009, name: "Barbar Kılıcı", type: "weapon", icon: "Sword", dmg: 70, forClass: "sura", requiredLevel: 40, iconSrc: "sura_weapon_9.png" },
    2010: { id: 2010, name: "Kanlı Kılıç", type: "weapon", icon: "Sword", dmg: 80, forClass: "sura", requiredLevel: 45, iconSrc: "sura_weapon_10.png" },
    2100: { id: 2100, name: "Siyah Rüzgar Takımı", type: "armor", icon: "Chestplate", def: 18, forClass: "sura", requiredLevel: 1 },
    2101: { id: 2101, name: "Büyülü Kask", type: "helmet", icon: "Helmet", def: 6, forClass: "sura", requiredLevel: 1 },

    // --- NİNJA EŞYALARI ---
    3001: { id: 3001, name: "Hançer", type: "weapon", icon: "Sword", dmg: 20, forClass: "ninja", requiredLevel: 1, iconSrc: "ninja_weapon_1.png" },
    3002: { id: 3002, name: "Amija", type: "weapon", icon: "Sword", dmg: 25, forClass: "ninja", requiredLevel: 5, iconSrc: "ninja_weapon_2.png" },
    3003: { id: 3003, name: "Kobra Hançeri", type: "weapon", icon: "Sword", dmg: 30, forClass: "ninja", requiredLevel: 10, iconSrc: "ninja_weapon_3.png" },
    3004: { id: 3004, name: "Dokuz Pala", type: "weapon", icon: "Sword", dmg: 35, forClass: "ninja", requiredLevel: 15, iconSrc: "ninja_weapon_4.png" },
    3005: { id: 3005, name: "Makas Hançer", type: "weapon", icon: "Sword", dmg: 40, forClass: "ninja", requiredLevel: 20, iconSrc: "ninja_weapon_5.png" },
    3006: { id: 3006, name: "Kısa Bıçak", type: "weapon", icon: "Sword", dmg: 45, forClass: "ninja", requiredLevel: 25, iconSrc: "ninja_weapon_6.png" },
    3007: { id: 3007, name: "Siyah Yaprak Hançeri", type: "weapon", icon: "Sword", dmg: 55, forClass: "ninja", requiredLevel: 30, iconSrc: "ninja_weapon_7.png" },
    3008: { id: 3008, name: "Kedi Isırığı Bıçak", type: "weapon", icon: "Sword", dmg: 60, forClass: "ninja", requiredLevel: 36, iconSrc: "ninja_weapon_8.png" },
    3009: { id: 3009, name: "Şeytan Surat Hançer", type: "weapon", icon: "Sword", dmg: 70, forClass: "ninja", requiredLevel: 40, iconSrc: "ninja_weapon_9.png" },
    3010: { id: 3010, name: "Şeytan Yumruğu Hançeri", type: "weapon", icon: "Sword", dmg: 80, forClass: "ninja", requiredLevel: 45, iconSrc: "ninja_weapon_10.png" },
    3100: { id: 3100, name: "Mavi Kuşak Elbise", type: "armor", icon: "Chestplate", def: 12, forClass: "ninja", requiredLevel: 1 },
    3101: { id: 3101, name: "Bıçakçının Şapkası", type: "helmet", icon: "Helmet", def: 4, forClass: "ninja", requiredLevel: 1 },

    // --- ŞAMAN EŞYALARI ---
    4001: { id: 4001, name: "Yelpaze", type: "weapon", icon: "Sword", dmg: 18, forClass: "shaman", requiredLevel: 1, iconSrc: "shaman_weapon_1.png" },
    4002: { id: 4002, name: "Demir Yaprak Yelpaze", type: "weapon", icon: "Sword", dmg: 23, forClass: "shaman", requiredLevel: 5, iconSrc: "shaman_weapon_2.png" },
    4003: { id: 4003, name: "Siyah Kaplan Yelpaze", type: "weapon", icon: "Sword", dmg: 28, forClass: "shaman", requiredLevel: 10, iconSrc: "shaman_weapon_3.png" },
    4004: { id: 4004, name: "Turna Kanadı Yelpaze", type: "weapon", icon: "Sword", dmg: 33, forClass: "shaman", requiredLevel: 15, iconSrc: "shaman_weapon_4.png" },
    4005: { id: 4005, name: "Tavuskuşu Yelpaze", type: "weapon", icon: "Sword", dmg: 38, forClass: "shaman", requiredLevel: 20, iconSrc: "shaman_weapon_5.png" },
    4006: { id: 4006, name: "Su Yelpazesi", type: "weapon", icon: "Sword", dmg: 43, forClass: "shaman", requiredLevel: 25, iconSrc: "shaman_weapon_6.png" },
    4007: { id: 4007, name: "Sonbahar Yelpazesi", type: "weapon", icon: "Sword", dmg: 53, forClass: "shaman", requiredLevel: 30, iconSrc: "shaman_weapon_7.png" },
    4008: { id: 4008, name: "Okyanus Yelpazesi", type: "weapon", icon: "Sword", dmg: 58, forClass: "shaman", requiredLevel: 36, iconSrc: "shaman_weapon_8.png" },
    4009: { id: 4009, name: "Azap Yelpazesi", type: "weapon", icon: "Sword", dmg: 68, forClass: "shaman", requiredLevel: 40, iconSrc: "shaman_weapon_9.png" },
    4010: { id: 4010, name: "Anka Kuşu Yelpaze", type: "weapon", icon: "Sword", dmg: 78, forClass: "shaman", requiredLevel: 45, iconSrc: "shaman_weapon_10.png" },
    4100: { id: 4100, name: "Mistik Kıyafet", type: "armor", icon: "Chestplate", def: 10, forClass: "shaman", requiredLevel: 1 },
    4101: { id: 4101, name: "Şaman Şapkası", type: "helmet", icon: "Helmet", def: 3, forClass: "shaman", requiredLevel: 1 },

    // --- LYCAN EŞYALARI ---
    5001: { id: 5001, name: "Çelik Meşale", type: "weapon", icon: "Sword", dmg: 22, forClass: "lycan", requiredLevel: 1, iconSrc: "lycan_weapon_1.png" },
    5002: { id: 5002, name: "Raptor", type: "weapon", icon: "Sword", dmg: 32, forClass: "lycan", requiredLevel: 10, iconSrc: "lycan_weapon_2.png" },
    5003: { id: 5003, name: "Teşrihçi", type: "weapon", icon: "Sword", dmg: 42, forClass: "lycan", requiredLevel: 20, iconSrc: "lycan_weapon_3.png" },
    5004: { id: 5004, name: "Anka Kuşu Şişi", type: "weapon", icon: "Sword", dmg: 52, forClass: "lycan", requiredLevel: 30, iconSrc: "lycan_weapon_4.png" },
    5005: { id: 5005, name: "Kader Pençesi", type: "weapon", icon: "Sword", dmg: 62, forClass: "lycan", requiredLevel: 40, iconSrc: "lycan_weapon_5.png" },
    5006: { id: 5006, name: "Demir Pençe", type: "weapon", icon: "Sword", dmg: 72, forClass: "lycan", requiredLevel: 45, iconSrc: "lycan_weapon_6.png" },
    5100: { id: 5100, name: "Kurt Derisi Zırh", type: "armor", icon: "Chestplate", def: 22, forClass: "lycan", requiredLevel: 1 },
    5101: { id: 5101, name: "Pençe Kaskı", type: "helmet", icon: "Helmet", def: 7, forClass: "lycan", requiredLevel: 1 },
};

const UPGRADE_DATA = {
    0: { cost: 5000,    successRate: 1.00, weaponDmg: 3, armorDef: 2 },
    1: { cost: 10000,   successRate: 0.90, weaponDmg: 3, armorDef: 2 },
    2: { cost: 25000,   successRate: 0.80, weaponDmg: 3, armorDef: 2 },
    3: { cost: 50000,   successRate: 0.70, weaponDmg: 4, armorDef: 3 },
    4: { cost: 100000,  successRate: 0.60, weaponDmg: 4, armorDef: 3 },
    5: { cost: 250000,  successRate: 0.50, weaponDmg: 4, armorDef: 3 },
    6: { cost: 500000,  successRate: 0.40, weaponDmg: 5, armorDef: 5 },
    7: { cost: 1000000, successRate: 0.30, weaponDmg: 5, armorDef: 5 },
    8: { cost: 2500000, successRate: 0.20, weaponDmg: 6, armorDef: 6 }
};

function getItemSVG(icon) {
    return SVG_ICONS[icon] || SVG_ICONS["Question"];
}

function initTestItems() {
    updateInventoryUI();
}
// ... (client.js'in 300. satırından sonraki itemDB ve UI, Drag&Drop mantıkları aynı kaldı)

// --------------------------- ENVANTER UI ---------------------------
function updateInventoryUI() {
    const me = players[mySocketId]; // Mevcut oyuncu verisini al
    const grid = document.getElementById("inventoryGrid");
    grid.innerHTML = "";
    
    // --- ENVANTER IZGARASI GÜNCELLEMESİ ---
    inventory.forEach((item, i) => {
        const slot = document.createElement("div");
        slot.className = "inv-slot";
        slot.dataset.index = i;
        // Eşya şu an ticarette mi kontrol et
        if (currentTradeSession && 
            currentTradeSession.myOffer.items.some(offer => offer.invIndex === i)) 
        {
            slot.classList.add("in-trade");
        }
        // --- YENİ GÜNCELLEME SONU ---
        if (item) {
            let iconPath = '';
            
            // Eşya tipine göre doğru klasörü belirle
            if (item.iconSrc) {
                if (item.type === 'weapon') {
                    iconPath = `/assets/weapons/${item.iconSrc}`;
                } else if (item.type === 'consumable') { // POTLAR İÇİN merchants KLASÖRÜ
                    iconPath = `/assets/merchants/${item.iconSrc}`;
                } else { // armor, helmet, shield, necklace, earring, bracelet, shoes
                    iconPath = `/assets/armors/${item.iconSrc}`; 
                }
                slot.innerHTML = `<img src="${iconPath}" alt="${item.name}">`;
            } else {
                slot.innerHTML = getItemSVG(item.icon);
            }

            // Tüketilebilir eşyaları kullanmak için çift tıklama
            if (item.type === 'consumable') {
                slot.ondblclick = () => {
                    handleConsumableUse(i); // i: envanter indexi
                };
            }
            
            // Sürükle-Bırak için gerekli
            slot.draggable = true;
            slot.addEventListener("dragstart", dragStart);

            let tooltip = `${item.name}\n`;

            // Pot yığın miktarını tooltipe ve slota ekle
            if (item.type === 'consumable' && item.quantity) {
                tooltip = `[x${item.quantity}] ${tooltip}`; // Tooltipe miktarı ekle
                
                // Miktarı ikonun sağ altına yerleştirmek için bir span ekleyelim
                const quantitySpan = document.createElement('span');
                quantitySpan.className = 'item-quantity';
                quantitySpan.textContent = item.quantity;
                slot.appendChild(quantitySpan);
            }
            if (item.plus && item.plus > 0) { 
                        const plusSpan = document.createElement("span");
                        plusSpan.classList.add("item-plus");
                        plusSpan.textContent = `+${item.plus}`;
                        slot.appendChild(plusSpan);
                    }
            
            // Seviye şartını düz metin olarak tooltipe ekle
            if (item.requiredLevel) {
                const canEquip = me && me.level >= item.requiredLevel;
                
                if (!canEquip) {
                    tooltip += `GEREKLİ SEVİYE: ${item.requiredLevel} (Yetersiz)\n`;
                } else {
                    tooltip += `Seviye: ${item.requiredLevel}\n`;
                }
            }
            // SINIF KONTROLÜ
            if (item.forClass) tooltip += `Sınıf: ${item.forClass.toUpperCase()}\n`;
            
            // STAT KONTROLLERİ
            if (item.dmg) tooltip += `+${item.dmg} Saldırı\n`;
            if (item.def) tooltip += `+${item.def} Savunma\n`;
            if (item.hp) tooltip += `+${item.hp} Can\n`;
            if (item.mp) tooltip += `+${item.mp} Mana\n`;
            if (item.speed) tooltip += `+${item.speed} Hız`;
            slot.dataset.tooltip = tooltip.trim();
        }
        grid.appendChild(slot);
    });

    // --- KUŞANMA SLOTLARI GÜNCELLEMESİ ---
    Object.keys(equipment).forEach(type => {
        const slot = document.querySelector(`.equip-slot[data-type="${type}"]`);
        if (equipment[type]) {
            const equippedItem = equipment[type]; 
            
            let iconPath = '';
            // iconSrc varsa PNG kullan, yoksa SVG kullan
            if (equippedItem.iconSrc) {
                if (equippedItem.type === 'weapon') {
                    iconPath = `/assets/weapons/${equippedItem.iconSrc}`;
                } else if (equippedItem.type === 'consumable') { // Tüketilebilir (Pot)
                    iconPath = `/assets/merchants/${equippedItem.iconSrc}`;
                } else { // Diğer kuşanılabilirler
                    iconPath = `/assets/armors/${equippedItem.iconSrc}`;
                }
                slot.innerHTML = `<img src="${iconPath}" alt="${equippedItem.name}">`;
            } else {
                slot.innerHTML = getItemSVG(equippedItem.icon);
            }
            
            slot.classList.add("equipped");
            let tooltip = `${equippedItem.name}\n`;
            
            // Seviye/Sınıf şartını kuşanılan eşya tooltipe ekle
            if (equippedItem.requiredLevel) tooltip += `Seviye: ${equippedItem.requiredLevel}\n`;
            if (equippedItem.forClass) tooltip += `Sınıf: ${equippedItem.forClass.toUpperCase()}\n`;
            
            if (equippedItem.dmg) tooltip += `+${equippedItem.dmg} Saldırı\n`;
            if (equippedItem.def) tooltip += `+${equippedItem.def} Savunma\n`;
            if (equippedItem.hp) tooltip += `+${equippedItem.hp} Can\n`;
            if (equippedItem.mp) tooltip += `+${equippedItem.mp} Mana\n`;
            if (equippedItem.speed) tooltip += `+${equippedItem.speed} Hız`;
            slot.dataset.tooltip = tooltip.trim();
        } else {
            const iconType = type.charAt(0).toUpperCase() + type.slice(1);
            slot.innerHTML = getItemSVG(iconType);
            slot.classList.remove("equipped");
            slot.removeAttribute("data-tooltip");
        }
    });
}


// client.js (dragStart fonksiyonu)
let draggedItem = null;
let draggedFrom = null;

function dragStart(e) {
    const targetSlot = e.currentTarget; 
    const index = targetSlot.dataset.index;
    const item = inventory[index];
    
    // YETENEK PANELİNDEN SÜRÜKLEME
    const skillId = e.target.dataset.skillId;
    if (skillId) {
        // Beceri mantığı
        draggedSkillId = skillId;
        e.dataTransfer.setData("text/skill", JSON.stringify({ type: 'skill', skillId: skillId })); 
        return;
    }

    // AKSİYON ÇUBUĞUNDAN SÜRÜKLEME (Çalışan Action Bar taşıma mantığı)
    const actionSlot = e.target.closest('.action-slot');
    if (actionSlot) {
        // data-slot niteliğini kullanarak indexi al
        const slotIndex = parseInt(actionSlot.dataset.slot) - 1; 
        const itemOrSkill = actionBarSlots[slotIndex];

        if (itemOrSkill) {
            e.dataTransfer.setData("text/actionbar", JSON.stringify({ type: 'actionbar', index: slotIndex, data: itemOrSkill }));
            // Görselleştirme için
            e.dataTransfer.setDragImage(actionSlot, 0, 0); 
            return; 
        }
    } 
    
    // --- ENVANTERDEN SÜRÜKLEME (TÜM ITEMLER) ---
    if (targetSlot && item) {
        const isConsumable = item.type === 'consumable';
        
        // Tüm kuşanılabilir/tüketilebilir eşyaların sürüklenmesine izin ver.
        if (isConsumable || item.type === 'weapon' || item.type === 'armor' || item.type === 'helmet' || item.type === 'shield' || 
            item.type === 'necklace' || item.type === 'earring' || item.type === 'bracelet' || item.type === 'shoes') {
             
             // KRİTİK: Item'in envanter indexini JSON formatında sakla.
             e.dataTransfer.setData("text/inventory", JSON.stringify({ 
                type: 'inventory', 
                index: index 
             }));
             
             // Görselleştirme için
             e.dataTransfer.setDragImage(targetSlot, 0, 0); 
             return;
        } else {
             // Sürüklenemez eşya ise:
             e.dataTransfer.clearData(); 
             e.preventDefault(); 
        }
    }
}

// client.js (handleSkillDragStart fonksiyonunun GÜNCEL HALİ)
function handleSkillDragStart(e, skillId) {
    draggedSkillId = skillId;
    // YENİ FORMAT
    e.dataTransfer.setData("text/skill", JSON.stringify({ type: 'skill', skillId: skillId }));
}
function allowDrop(e) { 
    e.preventDefault(); 
}

// client.js (drop fonksiyonu)
function drop(e) {
    e.preventDefault();
    // DropZone'u data-slot niteliğine sahip en yakın action-slot olarak bul
    const dropZone = e.target.closest('.action-slot, .inv-slot, #inventoryGrid'); 
    if (!dropZone || dropZone.classList.contains('inv-slot') || dropZone.id === 'inventoryGrid') return; // Sadece action bar slotlarını işle

    // data-slot niteliğini kullanarak slot indexini al
    const slotIndex = parseInt(dropZone.dataset.slot) - 1; 
    
    let data = null;
    let rawData = null;
    let dataType = null;
    
    // 1. Hangi veri formatı aktarılıyor?
    if (e.dataTransfer.types.includes("text/inventory")) {
        dataType = "inventory";
        rawData = e.dataTransfer.getData("text/inventory");
    } else if (e.dataTransfer.types.includes("text/skill")) {
        dataType = "skill";
        rawData = e.dataTransfer.getData("text/skill");
    } else if (e.dataTransfer.types.includes("text/actionbar")) {
        dataType = "actionbar";
        rawData = e.dataTransfer.getData("text/actionbar");
    } else if (e.dataTransfer.types.includes("text/plain")) {
        // Beceri panelinden gelen basit string veriyi dene (fallback)
        dataType = "skill_fallback";
        rawData = e.dataTransfer.getData("text/plain");
    }
    
    if (!rawData) return;
    
    try {
        data = JSON.parse(rawData);
    } catch (error) {
        // Eğer JSON parse edilemezse, text/plain'den gelen veriyi dene (özellikle beceriler için)
        if (dataType === "skill_fallback") {
             data = { type: 'skill', skillId: rawData };
        } else {
            console.error(`Drop verisi (${dataType}) JSON parse edilemedi:`, rawData, error);
            return;
        }
    }
    
    // DropZone'da zaten bir içerik varsa, onu geçici olarak kaydet
    const existingContent = actionBarSlots[slotIndex];

    if (data.type === 'skill' || dataType === 'skill_fallback') {
        // 1. Yetenek Panelinden Sürükleme
        
        // Beceri ID'sini doğru yerden al
        const skillId = data.skillId || data.skill_fallback; 
        
        // Beceri öğrenilmiş mi kontrolü
        const me = players[mySocketId];
        if (me && me.skills && me.skills[skillId] !== undefined && me.skills[skillId] > 0) {
             actionBarSlots[slotIndex] = { type: 'skill', id: skillId };
        } else {
             showWarnPanel("Bu beceriyi kısayol çubuğuna koymak için önce öğrenmelisin.");
             actionBarSlots[slotIndex] = existingContent;
             renderActionBar();
             return;
        }

    } else if (data.type === 'inventory') {
        // 2. Envanterden Sürükleme (Potlar için)
        const inventoryIndex = parseInt(data.index); 
        const invItem = inventory[inventoryIndex];

        // KRİTİK KONTROL: YUVAYA BIRAKILAN ÖĞE TÜKETİLEBİLİR Mİ?
        if (invItem && invItem.type === 'consumable') {
            // Pot için envanter indexini ve item ID'sini kaydet
            actionBarSlots[slotIndex] = { 
                type: 'item', 
                invIndex: inventoryIndex, 
                id: invItem.id 
            };
        } else {
            // Sadece potlar Action Bar'a gidebilir.
            showWarnPanel("Aksiyon çubuğuna sadece tüketilebilir (pot) eşyalar yerleştirilebilir.");
            actionBarSlots[slotIndex] = existingContent;
            renderActionBar();
            return;
        }

    } else if (data.type === 'actionbar') {
        // 3. Aksiyon Çubuğundan Taşıma/Değiştirme
        const sourceIndex = data.index;
        const sourceData = data.data;

        // Hedef slotun önceki içeriğini, kaynak slota geri koy
        actionBarSlots[sourceIndex] = existingContent; 

        // Kaynak slotun içeriğini, hedef slota yerleştir
        actionBarSlots[slotIndex] = sourceData;
    } else {
        return;
    }
    
    renderActionBar();
}


function dropEquip(e) {
    e.preventDefault();
    const target = e.currentTarget;

    let data = null;
    try {
        // text/inventory formatındaki veriyi okumaya çalış
        const rawData = e.dataTransfer.getData("text/inventory");
        if (!rawData) return;
        data = JSON.parse(rawData);
    } catch (error) {
        console.error("DropEquip: Veri alınamadı veya parse edilemedi.", error);
        return;
    }

    if (!data || data.type !== "inventory") return;

    const inventoryIndex = parseInt(data.index);
    const draggedItem = inventory[inventoryIndex];
    const targetType = target.dataset.type;

    if (!draggedItem) return;

    // Tüketilebilir eşyalar kuşanma slotlarına bırakılamaz
    if (draggedItem.type === 'consumable') {
        showWarnPanel("Potlar kuşanma slotlarına yerleştirilemez.");
        return;
    }

    // Kuşanılmak istenen itemin tipi, hedef slotun tipiyle uyuşmalı
    if (draggedItem.type === targetType) {
        // Sunucuya kuşanma isteği gönderirken envanter indexini de gönder
        socket.emit("equipItem", { 
            type: targetType, 
            item: draggedItem, 
            inventoryIndex: inventoryIndex 
        });
    } else {
        showWarnPanel(`Bu eşya (${draggedItem.type}) bu slota (${targetType}) kuşanılamaz.`);
    }
}

// --------------------------- KARAKTER SEÇİMİ ---------------------------
kingdomSelection.addEventListener("click", (e) => {
    if (e.target.tagName === "BUTTON") {
        kingdomSelection.querySelectorAll("button").forEach(b => b.classList.remove("selected"));
        e.target.classList.add("selected");
        playerChoices.kingdom = e.target.dataset.kingdom; 
    }
});

classSelection.addEventListener("click", (e) => {
    if (e.target.tagName === "BUTTON") {
        classSelection.querySelectorAll("button").forEach(b => b.classList.remove("selected"));
        e.target.classList.add("selected");
        playerChoices.class = e.target.dataset.class; 
    }
});


// --------------------------- OYUN MOTORU ---------------------------
function resizeCanvas() {
    const scale = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * scale;
    canvas.height = window.innerHeight * scale;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const CLIENT_MAP_DATA = {
    village: { src: "/assets/village_map.jpg", width: 6440, height: 4480 },
    forest: { src: "/assets/forest_map.jpg", width: 6160, height: 4480 },
    desert: { src: "/assets/desert_map.jpg", width: 6160, height: 4480 },
    ice: { src: "/assets/ice_map.jpg", width: 6160, height: 4480 },
};

const assetDefinitions = {
    warrior: {
        walk: { src: "/assets/warrior_walk.png", frames: 8, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        idle: { src: "/assets/warrior_idle.png", frames: 2, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        slash: { src: "/assets/warrior_slash.png", frames: 5, rows: 4, frameWidth: 192, frameHeight: 192, pivotX: 96, pivotY: 96 },
        hurt: { src: "/assets/warrior_hurt.png", frames: 5, rows: 1, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        hitbox: { width: 64, height: 64 }
    },
    ninja: {
        walk: { src: "/assets/ninja_walk.png", frames: 8, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        idle: { src: "/assets/ninja_idle.png", frames: 2, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        slash: { src: "/assets/ninja_slash.png", frames: 5, rows: 4, frameWidth: 192, frameHeight: 192, pivotX: 96, pivotY: 96 },
        hurt: { src: "/assets/ninja_hurt.png", frames: 5, rows: 1, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        hitbox: { width: 64, height: 64 }
    },
    sura: {
        walk: { src: "/assets/sura_walk.png", frames: 8, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        idle: { src: "/assets/sura_idle.png", frames: 2, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        slash: { src: "/assets/sura_slash.png", frames: 5, rows: 4, frameWidth: 192, frameHeight: 192, pivotX: 96, pivotY: 96 },
       hurt: { src: "/assets/sura_hurt.png", frames: 5, rows: 1, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        hitbox: { width: 64, height: 64 }
    },
    shaman: {
        walk: { src: "/assets/shaman_walk.png", frames: 8, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        idle: { src: "/assets/shaman_idle.png", frames: 2, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        slash: { src: "/assets/shaman_slash.png", frames: 5, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        hurt: { src: "/assets/shaman_hurt.png", frames: 5, rows: 1, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        hitbox: { width: 64, height: 64 }
    },
    lycan: {
        walk: { src: "/assets/lycan_walk.png", frames: 8, rows: 4, frameWidth: 192, frameHeight: 192, pivotX: 96, pivotY: 96 },
        idle: { src: "/assets/lycan_idle.png", frames: 2, rows: 4, frameWidth: 192, frameHeight: 192, pivotX: 96, pivotY: 96 },
        slash: { src: "/assets/lycan_slash.png", frames: 5, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        hurt: { src: "/assets/lycan_hurt.png", frames: 5, rows: 1, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        hitbox: { width: 64, height: 64 }
    },
    blacksmith: {
        idle: { 
            src: "/assets/blacksmith.png", frames: 1, 
            frameWidth: 64, frameHeight: 64, 
            pivotX: 32, pivotY: 64,
            drawWidth: 128, drawHeight: 128
        }, 
        hitbox: { width: 64, height: 64 }
    },
    merchant: {
        idle: { 
            src: "/assets/merchant.png", 
            frames: 6,
            frameWidth: 32, 
            frameHeight: 64,
            pivotX: 16, 
            pivotY: 64,
            drawWidth: 128,
            drawHeight: 128
        }, 
        hitbox: { width: 64, height: 64 }
    },
    orc: {
        walk: { src: "/assets/mobs/orc_walk.png", frames: 8, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        idle: { src: "/assets/mobs/orc_idle.png", frames: 2, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        attack: { src: "/assets/mobs/orc_attack.png", frames: 5, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 }, 
        hurt: { src: "/assets/mobs/orc_hurt.png", frames: 5, rows: 1, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32, speed: 10 },
        hitbox: { width: 40, height: 40 }
    },
    pig: {
        walk: { src: "/assets/mobs/orc_walk.png", frames: 8, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        idle: { src: "/assets/mobs/orc_idle.png", frames: 2, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        attack: { src: "/assets/mobs/orc_attack.png", frames: 5, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 }, 
        hurt: { src: "/assets/mobs/orc_hurt.png", frames: 5, rows: 1, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32, speed: 10 },
        hitbox: { width: 30, height: 30 } // Domuz için hitbox'ı küçülttük
    },
    boar: {
        walk: { src: "/assets/mobs/orc_walk.png", frames: 8, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        idle: { src: "/assets/mobs/orc_idle.png", frames: 2, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        attack: { src: "/assets/mobs/orc_attack.png", frames: 5, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 }, 
        hurt: { src: "/assets/mobs/orc_hurt.png", frames: 5, rows: 1, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32, speed: 10 },
        hitbox: { width: 35, height: 35 } // Yaban Domuzu için hitbox
    },
    alphaWolf: {
        walk: { src: "/assets/mobs/orc_walk.png", frames: 8, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        idle: { src: "/assets/mobs/orc_idle.png", frames: 2, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        attack: { src: "/assets/mobs/orc_attack.png", frames: 5, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 }, 
        hurt: { src: "/assets/mobs/orc_hurt.png", frames: 5, rows: 1, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32, speed: 10 },
        hitbox: { width: 40, height: 40 }
    },
    direWolf: {
        walk: { src: "/assets/mobs/orc_walk.png", frames: 8, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        idle: { src: "/assets/mobs/orc_idle.png", frames: 2, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        attack: { src: "/assets/mobs/orc_attack.png", frames: 5, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 }, 
        hurt: { src: "/assets/mobs/orc_hurt.png", frames: 5, rows: 1, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32, speed: 10 },
        hitbox: { width: 45, height: 45 } // Biraz daha büyük
    },
    shadowWolf: {
        walk: { src: "/assets/mobs/orc_walk.png", frames: 8, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        idle: { src: "/assets/mobs/orc_idle.png", frames: 2, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        attack: { src: "/assets/mobs/orc_attack.png", frames: 5, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 }, 
        hurt: { src: "/assets/mobs/orc_hurt.png", frames: 5, rows: 1, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32, speed: 10 },
        hitbox: { width: 40, height: 40 }
    },
    rabidWolf: {
        walk: { src: "/assets/mobs/orc_walk.png", frames: 8, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        idle: { src: "/assets/mobs/orc_idle.png", frames: 2, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        attack: { src: "/assets/mobs/orc_attack.png", frames: 5, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 }, 
        hurt: { src: "/assets/mobs/orc_hurt.png", frames: 5, rows: 1, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32, speed: 10 },
        hitbox: { width: 40, height: 40 }
    },
    ancientWolf: {
        walk: { src: "/assets/mobs/orc_walk.png", frames: 8, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        idle: { src: "/assets/mobs/orc_idle.png", frames: 2, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        attack: { src: "/assets/mobs/orc_attack.png", frames: 5, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 }, 
        hurt: { src: "/assets/mobs/orc_hurt.png", frames: 5, rows: 1, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32, speed: 10 },
        hitbox: { width: 50, height: 50 } // En büyük kurt
    },
    spider: {
        walk: { src: "/assets/mobs/orc_walk.png", frames: 8, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        idle: { src: "/assets/mobs/orc_idle.png", frames: 2, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        attack: { src: "/assets/mobs/orc_attack.png", frames: 5, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 }, 
        hurt: { src: "/assets/mobs/orc_hurt.png", frames: 5, rows: 1, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32, speed: 10 },
        hitbox: { width: 40, height: 40 }
    },
    giantSpider: {
        walk: { src: "/assets/mobs/orc_walk.png", frames: 8, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        idle: { src: "/assets/mobs/orc_idle.png", frames: 2, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        attack: { src: "/assets/mobs/orc_attack.png", frames: 5, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 }, 
        hurt: { src: "/assets/mobs/orc_hurt.png", frames: 5, rows: 1, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32, speed: 10 },
        hitbox: { width: 60, height: 60 } // Büyük örümcek
    },
    // --- TÜM MOBLAR ORC OLARAK AYARLANDI (WOLF DAHİL) ---
    wolf: {
        walk: { src: "/assets/mobs/orc_walk.png", frames: 8, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        idle: { src: "/assets/mobs/orc_idle.png", frames: 2, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        attack: { src: "/assets/mobs/orc_attack.png", frames: 5, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 }, 
        hurt: { src: "/assets/mobs/orc_hurt.png", frames: 5, rows: 1, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32, speed: 10 },
        hitbox: { width: 40, height: 40 }
    },
    snake: {
        walk: { src: "/assets/mobs/orc_walk.png", frames: 8, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        idle: { src: "/assets/mobs/orc_idle.png", frames: 2, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        attack: { src: "/assets/mobs/orc_attack.png", frames: 5, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 }, 
       hurt: { src: "/assets/mobs/orc_hurt.png", frames: 5, rows: 1, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32, speed: 10 },
        hitbox: { width: 40, height: 40 }
    },
    demon: {
        walk: { src: "/assets/mobs/orc_walk.png", frames: 8, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        idle: { src: "/assets/mobs/orc_idle.png", frames: 2, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        attack: { src: "/assets/mobs/orc_attack.png", frames: 5, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 }, 
        hurt: { src: "/assets/mobs/orc_hurt.png", frames: 5, rows: 1, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32, speed: 10 },
        hitbox: { width: 40, height: 40 }
    },
    spirit: {
        walk: { src: "/assets/mobs/orc_walk.png", frames: 8, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        idle: { src: "/assets/mobs/orc_idle.png", frames: 2, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        attack: { src: "/assets/mobs/orc_attack.png", frames: 5, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 }, 
        hurt: { src: "/assets/mobs/orc_hurt.png", frames: 5, rows: 1, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32, speed: 10 },
        hitbox: { width: 40, height: 40 }
    },
    golem: {
        walk: { src: "/assets/mobs/orc_walk.png", frames: 8, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        idle: { src: "/assets/mobs/orc_idle.png", frames: 2, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        attack: { src: "/assets/mobs/orc_attack.png", frames: 5, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 }, 
        hurt: { src: "/assets/mobs/orc_hurt.png", frames: 5, rows: 1, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32, speed: 10 },
        hitbox: { width: 40, height: 40 }
    },
    scorpion: {
        walk: { src: "/assets/mobs/orc_walk.png", frames: 8, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        idle: { src: "/assets/mobs/orc_idle.png", frames: 2, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        attack: { src: "/assets/mobs/orc_attack.png", frames: 5, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 }, 
        hurt: { src: "/assets/mobs/orc_hurt.png", frames: 5, rows: 1, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32, speed: 10 },
        hitbox: { width: 40, height: 40 }
    },
    desertSnake: {
        walk: { src: "/assets/mobs/orc_walk.png", frames: 8, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        idle: { src: "/assets/mobs/orc_idle.png", frames: 2, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        attack: { src: "/assets/mobs/orc_attack.png", frames: 5, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 }, 
        hurt: { src: "/assets/mobs/orc_hurt.png", frames: 5, rows: 1, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32, speed: 10 },
        hitbox: { width: 40, height: 40 }
    },
    iceGolem: {
        walk: { src: "/assets/mobs/orc_walk.png", frames: 8, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        idle: { src: "/assets/mobs/orc_idle.png", frames: 2, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        attack: { src: "/assets/mobs/orc_attack.png", frames: 5, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 }, 
        hurt: { src: "/assets/mobs/orc_hurt.png", frames: 5, rows: 1, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32, speed: 10 },
        hitbox: { width: 40, height: 40 }
    },
    yeti: {
        walk: { src: "/assets/mobs/orc_walk.png", frames: 8, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        idle: { src: "/assets/mobs/orc_idle.png", frames: 2, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 },
        attack: { src: "/assets/mobs/orc_attack.png", frames: 5, rows: 4, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32 }, 
        hurt: { src: "/assets/mobs/orc_hurt.png", frames: 5, rows: 1, frameWidth: 64, frameHeight: 64, pivotX: 32, pivotY: 32, speed: 10 },
        hitbox: { width: 40, height: 40 }
    },
    // --- DEĞİŞİKLİK SONU ---
};

const directionRowMap = { up: 0, left: 1, down: 2, right: 3 };

let players = {};
let mobs = {};
let npcs = {};
let portals = []; 
let mySocketId = null;
const camera = { x: 0, y: 0 };
const keysPressed = { w: false, a: false, s: false, d: false };
const loadedImages = {};
const animData = {};

// --------------------------- UI ---------------------------
function setupUI() {
    // --- AKSIYON ÇUBUĞU DÜZELTME BAŞLANGICI ---
    const actionBarSlotsEl = document.querySelectorAll("#actionBar .action-slot");

    if (actionBarSlotsEl.length > 0) {
        actionBarSlotsEl.forEach((slot, index) => {
            slot.dataset.slot = index + 1; 
            
            // Sağa tıklama ile item/skill'i kaldırma
            slot.addEventListener("click", (e) => {
                 if (e.button === 2 || e.ctrlKey) { 
                    e.preventDefault();
                    actionBarSlots[index] = null;
                    renderActionBar();
                 }
            });
            
            slot.addEventListener("contextmenu", e => e.preventDefault());
            
            // Beceriyi/Potu yuvaya bırakma
            slot.addEventListener("dragover", allowDrop);
            slot.addEventListener("drop", (e) => {
                drop(e); 
            });
        });
    }
    // --- AKSIYON ÇUBUĞU DÜZELTME SONU ---


    document.getElementById("inventoryBtn").addEventListener("click", () => {
        document.getElementById("inventoryPanel").classList.toggle("hidden");
    });

    document.querySelectorAll(".equip-slot").forEach(slot => {
    slot.addEventListener("dragover", allowDrop);
    slot.addEventListener("drop", dropEquip); 
    slot.addEventListener("click", () => {
            const type = slot.dataset.type;
            if (equipment[type]) {
                socket.emit("unequipItem", { type });
            }
        });
    });

    document.getElementById("inventoryGrid").addEventListener("dragover", allowDrop);
    document.getElementById("inventoryGrid").addEventListener("drop", drop);

    initTestItems();
}

function updateUI() {
    const me = players[mySocketId];
    if (!me) return;

    playerStats.level = me.level || 1;
    playerStats.hp = me.hp || 100;
    playerStats.maxHp = me.maxHp || 100;
    playerStats.mp = me.mp || 50;
    playerStats.maxMp = me.maxMp || 50;
    playerStats.exp = me.exp || 0;
    playerStats.maxExp = me.maxExp || 100;
    playerStats.yang = me.yang || 0;

    document.getElementById("playerLevel").textContent = playerStats.level;
    document.getElementById("hpBar").style.width = (playerStats.hp / playerStats.maxHp) * 100 + "%";
    document.getElementById("hpText").textContent = `${Math.floor(playerStats.hp)}/${playerStats.maxHp}`;
    document.getElementById("mpBar").style.width = (playerStats.mp / playerStats.maxMp) * 100 + "%";
    document.getElementById("mpText").textContent = `${Math.floor(playerStats.mp)}/${playerStats.maxMp}`;
    document.getElementById("expBar").style.width = (playerStats.exp / playerStats.maxExp) * 100 + "%";
    document.getElementById("expText").textContent = `${Math.floor(playerStats.exp)}/${playerStats.maxExp}`;
    const yangAmountEl = document.getElementById("playerYangAmount");
    if (yangAmountEl) {
        yangAmountEl.textContent = playerStats.yang.toLocaleString();
    }
}


// client.js (useActionBarSlot fonksiyonu)
/**
 * Aksiyon çubuğu slotundaki öğeyi kullanır (Pot veya Beceri).
 * @param {number} slotIndex - Aksiyon çubuğu slotunun indexi (0-5).
 */
function useActionBarSlot(slotIndex) {
    const slotContent = actionBarSlots[slotIndex];

    if (!slotContent) return;
    
    // COOLDOWN KONTROLÜ (Global Pot Cooldown)
    if (slotContent.type === 'item' && globalPotCooldownEnd > Date.now()) {
        const remaining = (globalPotCooldownEnd - Date.now()) / 1000;
        showWarnPanel(`Pot henüz kullanıma hazır değil. Bekle: ${remaining.toFixed(1)}s`);
        return;
    }
    
    if (slotContent.type === 'item') {
        // POT KULLANIMI
        
        // Potun envanterde hala var olup olmadığını kontrol et
        const invItem = inventory[slotContent.invIndex];
        // Pot ya yok (null) ya da index'te artık farklı bir item var
        if (!invItem || invItem.id !== slotContent.id || invItem.type !== 'consumable') { 
            // Pot yerinde yoksa veya farklı bir şey varsa, slotu temizle
            actionBarSlots[slotIndex] = null;
            renderActionBar();
            showWarnPanel("Pot envanterde bulunamadı veya değiştirildi. Lütfen kısayol çubuğunu yeniden ayarla.");
            return;
        }
        
        // Sunucuya pot kullanma isteği gönder (Sunucu cooldown'ı kontrol edecek ve güncelleyecek)
        socket.emit("useConsumable", { 
            itemId: slotContent.id,
            inventoryIndex: slotContent.invIndex // KRİTİK: Doğru index'i gönder
        });
        
    } else if (slotContent.type === 'skill') {
        // BECERİ KULLANIMI
        // Sunucuya beceri kullanma isteği gönder
        socket.emit("useSkill", { 
            skillId: slotContent.id,
            slotIndex: slotIndex
        });
    }
}


/**
 * Aksiyon çubuğundaki içeriği HTML'e çizer (Ikonlar ve Miktar).
 */
function renderActionBar() {
    const ACTION_SLOT_KEYS = ['1', '2', '3', '4', '5', '6']; 
    
    actionBarSlots.forEach((slotContent, index) => {
        const slotEl = document.querySelector(`.action-slot[data-slot="${index + 1}"]`); 
        if (!slotEl) return;

        // Slot içeriğini temizle ve Hotkey etiketini yeniden ekle
        slotEl.innerHTML = `<span class="hotkey-label">${ACTION_SLOT_KEYS[index]}</span>`; 
        slotEl.dataset.type = slotContent ? slotContent.type : '';
        slotEl.style.backgroundColor = slotContent ? 'rgba(255, 255, 255, 0.1)' : 'transparent';
        slotEl.draggable = slotContent ? true : false;
        
        if (slotContent) {
            let iconPath = '';
            let itemName = '';
            let itemQuantity = 0; 

            if (slotContent.type === 'skill') {
                const skill = CLIENT_SKILL_DB[slotContent.id];
                if (skill) {
                    itemName = skill.name;
                    iconPath = skill.icon; 
                }
            } else if (slotContent.type === 'item') {
                const item = ITEM_DB[slotContent.id];
                const invItem = inventory[slotContent.invIndex]; 

                if (item && item.type === 'consumable' && invItem) {
                    itemName = item.name;
                    iconPath = `/assets/merchants/${item.iconSrc}`;
                    itemQuantity = invItem.quantity || 1;
                } else {
                    actionBarSlots[index] = null;
                    renderActionBar(); 
                    return;
                }
            }
            
            if (iconPath) {
                 slotEl.innerHTML += `<img src="${iconPath}" alt="${itemName}">`;
            }

            // Pot yığın miktarını göster
            if (itemQuantity > 1) {
                const quantitySpan = document.createElement('span');
                quantitySpan.className = 'item-quantity'; 
                quantitySpan.textContent = itemQuantity;
                slotEl.appendChild(quantitySpan);
            }
            
            createCooldownOverlay(slotEl); 
        }
    });
    
    // Pot kullanımından sonra cooldown görselini başlat
    if (globalPotCooldownEnd > Date.now()) {
         requestAnimationFrame(updateCooldownVisuals);
    }
}

/**
 * Cooldown overlay elementini oluşturur.
 */
function createCooldownOverlay(slotEl) {
    let overlay = slotEl.querySelector('.cooldown-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'cooldown-overlay';
        slotEl.appendChild(overlay);
        const label = slotEl.querySelector('.hotkey-label');
        if(label) slotEl.appendChild(label); 
    }
    return overlay;
}

/**
 * Tüm aksiyon çubuğu pot slotlarındaki bekleme süresini görsel olarak günceller.
 */
function updateCooldownVisuals() {
    const now = Date.now();
    let isAnyPotOnCooldown = false;
    
    actionBarSlots.forEach((slotContent, index) => {
        const slotEl = document.querySelector(`.action-slot[data-slot="${index + 1}"]`);
        if (!slotEl) return;

        const potCooldownRemaining = globalPotCooldownEnd > now ? globalPotCooldownEnd - now : 0;
        
        if (slotContent && slotContent.type === 'item') {
            const overlay = slotEl.querySelector('.cooldown-overlay');

            if (potCooldownRemaining > 0) {
                isAnyPotOnCooldown = true;
                const remainingSec = (potCooldownRemaining / 1000).toFixed(1);
                const percentage = potCooldownRemaining / POT_COOLDOWN_DURATION; 
                
                overlay.textContent = remainingSec > 0.1 ? remainingSec : "";
                overlay.style.display = 'flex';
                overlay.style.clipPath = `polygon(0 0, 100% 0, 100% ${100 - (percentage * 100)}%, 0 ${100 - (percentage * 100)}%)`;

            } else {
                overlay.style.display = 'none';
                overlay.style.clipPath = `none`;
            }
        }
    });
    
    if (isAnyPotOnCooldown) {
        cooldownAnimationId = requestAnimationFrame(updateCooldownVisuals);
    } else {
        cooldownAnimationId = null;
    }
}


// --------------------------- INPUT ---------------------------
/**
 * Kullanıcı beceri seti seçim penceresini gösterir.
 */
function showSkillChoiceWindow(playerClass) {
    const me = players[mySocketId];
    if (!me) return;

    const options = SKILL_SET_OPTIONS[playerClass];
    if (!options) return;

    const windowEl = document.getElementById("skillChoiceWindow");
    const buttonsDiv = document.getElementById("skillChoiceButtons");
    const descEl = document.getElementById("skillChoiceDesc");
    const closeBtn = document.getElementById("skillChoiceCloseBtn");

    buttonsDiv.innerHTML = "";
    
    options.forEach(opt => {
        const btn = document.createElement("button");
        btn.innerHTML = `${opt.name} <span style='font-size:12px; color: #ccc'>(${opt.desc})</span>`;
        btn.onclick = () => {
            socket.emit("chooseSkillSet", opt.key);
            windowEl.classList.add("hidden");
        };
        buttonsDiv.appendChild(btn);
    });
    
    if (playerClass === "lycan" && options.length === 1) {
         descEl.textContent = "Lycan sınıfı tek bir uzmanlık yoluna sahiptir. Onaylamak için butona tıkla.";
    } else {
         descEl.textContent = "5. seviyeye ulaştın! Sınıfın için bir uzmanlık yolu seçmelisin. Bu seçim kalıcıdır.";
    }
    
    closeBtn.onclick = () => {
        windowEl.classList.add("hidden");
    };

    windowEl.classList.remove("hidden");
}

/**
 * Oyuncu bir NPC'ye tıkladığında bu fonksiyon tetiklenir.
 */
function onNpcClick(npc) {
    const me = players[mySocketId];
    if (!me) return;
    
    if (npc.asset === "merchant") { 
        showShopWindow(npc);
        return; 
    }

    if (npc.asset === "blacksmith") {
        openBlacksmithWindow(); // Yeni fonksiyonu çağır
        return;
    }
    
    if (npc.asset === me.class) {
        if (me.level >= 5 && me.skillSet === null) {
            showSkillChoiceWindow(me.class);
        } else if (me.skillSet !== null) {
            alert(`[${npc.name}]\n\nBecerilerinde ustalaşmaya devam et, ${me.name}!`);
        } else {
            alert(`[${npc.name}]\n\nHazır olduğunda (5. Seviye) sana öğreteceklerim olacak, ${me.name}.`);
        }
    } else {
        alert(`[${npc.name}]\n\ Merhaba, ${me.name}. Sana nasıl yardımcı olabilirim?`);
    }
}

/**
 * Kullanıcı canvas'a tıkladığında çalışır.
 */
function handleWorldClick(e) {
    const me = players[mySocketId];
    if (!me || !me.isAlive) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const worldX = mouseX + camera.x;
    const worldY = mouseY + camera.y;

    // --- YENİ: OYUNCU TIKLAMA KONTROLÜ ---
    // (NPC'den ÖNCE kontrol et, çünkü üst üste olabilirler)
    let clickedPlayer = null;
    for (const id in players) {
        if (id === mySocketId) continue; // Kendimiz hariç
        const p = players[id];
        if (me.map !== p.map || !p.isAlive) continue; // Sadece aynı haritadaki canlı oyuncular

        // Basit bir kutu çarpışması (hitbox)
        if (worldX >= p.x && 
            worldX <= p.x + p.width &&
            worldY >= p.y && 
            worldY <= p.y + p.height) 
        {
            clickedPlayer = p;
            break; 
        }
    }
    
    if (clickedPlayer) {
        openTargetPlayerMenu(clickedPlayer);
        return; // Oyuncuya tıkladıysak NPC'yi veya yeri arama
    }
    // --- YENİ KOD SONU ---

    // --- NPC TIKLAMA KONTROLÜ (Değişmedi) ---
    let clickedNpc = null;
    for (const id in npcs) {
        const npc = npcs[id];
        if (me.map !== npc.map) continue;

        if (worldX >= npc.x && 
            worldX <= npc.x + npc.width &&
            worldY >= npc.y && 
            worldY <= npc.y + npc.height) 
        {
            clickedNpc = npc;
            break; 
        }
    }

    if (clickedNpc) {
        onNpcClick(clickedNpc);
    } else if (!clickedPlayer) {
         // Eğer hiçbir şeye (NPC veya Oyuncu) tıklamadıysak,
         // açık olan hedef menüsünü kapat.
         closeTargetPlayerMenu();
    }
}

/**
 * Beceri Paneli UI'ını oyuncunun mevcut verileriyle günceller.
 */
function updateSkillPanelUI() {
    const me = players[mySocketId];
    const panel = document.getElementById("skillPanel");
    if (!me || !me.skillSet || panel.classList.contains("hidden")) return;

    const listEl = document.getElementById("skillPanelList");
    const pointsEl = document.getElementById("skillPointsDisplay");
    listEl.innerHTML = "";
    pointsEl.textContent = `Kalan Puan: ${me.skillPoints}`;
    const canUpgrade = me.skillPoints > 0;

    for (const skillId in me.skills) {
        const level = me.skills[skillId];
        const skillData = CLIENT_SKILL_DB[skillId];
        if (!skillData) continue;

        const row = document.createElement("div");
        row.className = "skill-row";

        const plusButton = canUpgrade
            ? `<button class="skill-plus-btn" data-skill-id="${skillId}">+</button>`
            : `<button class="skill-plus-btn" disabled>+</button>`;

        const isDraggable = level > 0;
        const draggableAttr = isDraggable ? 'draggable="true"' : '';
        const iconStyle = isDraggable ? '' : 'style="filter: grayscale(100%);"';
        
        row.innerHTML = `
            <div class="skill-icon" ${draggableAttr} ${iconStyle}
                 ondragstart="handleSkillDragStart(event, '${skillId}')">
                <img src="${skillData.icon}" alt="${skillData.name}" title="${skillData.name}">
            </div>
            <div class="skill-details">
                <div class="skill-name">${skillData.name}</div>
                <div class="skill-level">Seviye: ${level}</div>
            </div>
            ${plusButton}
        `;
        
        listEl.appendChild(row);
    }

    listEl.querySelectorAll('.skill-plus-btn:not(:disabled)').forEach(btn => {
        btn.onclick = (e) => {
            handleSpendSkillPoint(e.currentTarget.dataset.skillId);
        };
    });
}

/**
 * Karakter panelini açar/kapatır.
 */
function toggleCharacterPanel() {
    const panel = document.getElementById("characterPanel");
    panel.classList.toggle("hidden");

    if (!panel.classList.contains("hidden")) {
        updateCharacterPanelUI();
    }
}

/**
 * '+' butonuna tıklandığında sunucuya stat puanı harcama isteği gönderir.
 */
function handleSpendStatPoint(statType) {
    if (!statType) return;
    
    const btn = document.querySelector(`.stat-plus-btn[data-stat="${statType}"]`);
    if (btn) btn.disabled = true;
    
    socket.emit("spendStatPoint", statType);
}

/**
 * Karakter Paneli UI'ını oyuncunun mevcut verileriyle günceller.
 */
function updateCharacterPanelUI() {
    const me = players[mySocketId];
    const panel = document.getElementById("characterPanel");
    if (!me || panel.classList.contains("hidden")) return;

    const canUpgrade = me.statPoints > 0;

    document.getElementById("charInfoName").textContent = me.name;
    document.getElementById("charInfoLevel").textContent = me.level;
    document.getElementById("charInfoExp").textContent = `${Math.floor(me.exp)} / ${me.maxExp}`;

    document.getElementById("statVIT").textContent = me.stats.vit;
    document.getElementById("statSTR").textContent = me.stats.str;
    document.getElementById("statINT").textContent = me.stats.int;
    document.getElementById("statDEX").textContent = me.stats.dex;

    document.getElementById("charPointsDisplay").textContent = `Kalan Puan: ${me.statPoints}`;

    panel.querySelectorAll('.stat-plus-btn').forEach(btn => {
        const currentStatValue = me.stats[btn.dataset.stat] || 0;
        btn.disabled = !canUpgrade || currentStatValue >= 90; 
        
        btn.onclick = () => {
            handleSpendStatPoint(btn.dataset.stat);
        };
    });

    document.getElementById("derivedHP").textContent = `${Math.floor(me.hp)} / ${me.maxHp}`;
    document.getElementById("derivedMP").textContent = `${Math.floor(me.mp)} / ${me.maxMp}`;
    document.getElementById("derivedDMG").textContent = `${me.baseDmg + me.bonusDmg}`;
    document.getElementById("derivedDEF").textContent = me.bonusDef;
    document.getElementById("derivedMATK").textContent = me.magicAttack;
}



function handleSpendSkillPoint(skillId) {
    if (!skillId) return;
    const btn = document.querySelector(`.skill-plus-btn[data-skill-id="${skillId}"]`);
    if (btn) btn.disabled = true;
    
    socket.emit("spendSkillPoint", skillId);
}

/**
 * Beceri panelini açar/kapatır ve gerektiğinde günceller.
 */
function toggleSkillPanel() {
    const panel = document.getElementById("skillPanel");
    panel.classList.toggle("hidden");

    if (!panel.classList.contains("hidden")) {
        updateSkillPanelUI();
    }
}

/**
 * SkillBar UI'ını 'skillBarSlots' dizisine göre günceller.
 */
function updateSkillBarUI() {
    renderActionBar();
}
/**
 * 'K' panelinden bir beceriyi sürüklemeye başladığında tetiklenir.
 */
function handleSkillDragStart(e, skillId) {
    draggedSkillId = skillId;
    e.dataTransfer.setData("text/skill", JSON.stringify({ type: 'skill', skillId: skillId }));
    e.dataTransfer.setData("text/plain", skillId); 
    e.dataTransfer.effectAllowed = "copy";
}

/**
 * Sürüklenen beceriyi skillBar'daki bir yuvaya bıraktığında tetiklenir.
 */
function handleSkillDrop(e, slotIndex) {
    e.preventDefault();
    if (draggedSkillId) {
        actionBarSlots[slotIndex] = { type: 'skill', id: draggedSkillId }; 
        
        draggedSkillId = null;
        renderActionBar(); 
    }
}
/**
 * Envanterdeki tüketilebilir bir eşyayı (pot) kullanır.
 * @param {number} inventoryIndex - Envanterdeki eşyayın indexi.
 */
function handleConsumableUse(inventoryIndex) {
    const item = inventory[inventoryIndex];
    if (!item || item.type !== 'consumable') return;
    
    socket.emit("useConsumable", { 
        itemId: item.id,
        inventoryIndex: inventoryIndex
    });
}

function openBlacksmithWindow() {
    resetUpgradeSlot();
    blacksmithPanel.classList.remove("hidden");
    // Diğer panelleri kapat (opsiyonel ama önerilir)
    document.getElementById("inventoryPanel").classList.add("hidden");
    document.getElementById("shopPanel").classList.add("hidden");
}

/**
 * Demirci panelini verilen eşyaya göre günceller.
 * Eğer eşya +9 ise veya geçersizse slotu kilitler.
 */
function updateBlacksmithUI(item, inventoryIndex) {
    if (!item) {
        resetUpgradeSlot();
        return;
    }

    // 1. Global değişkeni ayarla
    itemInUpgradeSlot = { index: inventoryIndex, item: item };

    // 2. Tipi ve seviyeyi kontrol et
    const itemType = item.type;
    const currentPlus = item.plus || 0;

    if (itemType !== 'weapon' && itemType !== 'armor' && itemType !== 'helmet' && itemType !== 'shield') {
        showWarnPanel("Sadece Silah, Zırh, Kask ve Kalkanlar yükseltilebilir.");
        resetUpgradeSlot();
        return;
    }

    // 3. Slotun görselini güncelle
    const iconPath = item.iconSrc ? (itemType === 'weapon' ? `/assets/weapons/${item.iconSrc}` : `/assets/armors/${item.iconSrc}`) : null;
    if (iconPath) {
        upgradeSlot.innerHTML = `<img src="${iconPath}" alt="${item.name}">`;
    } else {
        upgradeSlot.innerHTML = getItemSVG(item.icon); // SVG fallback
    }
    upgradeSlot.classList.add("occupied");
    upgradeSlot.dataset.tooltip = item.name;

    // 4. Maksimum seviyeye ulaştı mı?
    if (currentPlus >= 9) {
        const itemName = item.name.split(' +')[0];
        upgradeItemName.textContent = `${itemName} (+9 Maksimum Seviye)`;
        upgradeCost.textContent = "Gerekli Yang: ---";
        upgradeSuccessChance.textContent = "Başarı Şansı: ---";
        upgradeButton.disabled = true;
        upgradeButton.textContent = "MAKS. SEVİYE";
        return; // +9 ise daha fazla bilgiye gerek yok
    }

    // 5. Info panelini (sonraki seviye için) güncelle
    const upgradeInfo = UPGRADE_DATA[currentPlus];
    const itemName = item.name.split(' +')[0]; // Ana adı al
    upgradeItemName.textContent = `${itemName} (+${currentPlus} -> +${currentPlus + 1})`;
    upgradeCost.textContent = `Gerekli Yang: ${upgradeInfo.cost.toLocaleString()}`;
    upgradeSuccessChance.textContent = `Başarı Şansı: ${upgradeInfo.successRate * 100}%`;
    
    // 6. Butonu aktifleştir (eğer parası varsa)
    const me = players[mySocketId];
    if (me && me.yang >= upgradeInfo.cost) {
        upgradeButton.disabled = false;
        upgradeButton.textContent = "YÜKSELT";
    } else {
        upgradeButton.disabled = true;
        upgradeButton.textContent = "YÜKSELT";
        upgradeCost.textContent += " (Yetersiz Yang)";
    }
}

function openTargetPlayerMenu(player) {
    if (!player || player.id === mySocketId) return; // Kendimize tıklayamayız
    
    selectedTargetPlayerId = player.id;
    targetPlayerName.textContent = `${player.name} (Lv. ${player.level})`;
    targetPlayerMenu.classList.remove("hidden");
    
    // TODO: Eğer oyuncu zaten partideyse "Davet" butonunu gizle/inaktif et
}

function closeTargetPlayerMenu() {
    selectedTargetPlayerId = null;
    targetPlayerMenu.classList.add("hidden");
}

function closeBlacksmithWindow() {
    // Eşyayı slottan "iade etmeye" gerek yok, çünkü envanterden hiç çıkmadı.
    resetUpgradeSlot();
    blacksmithPanel.classList.add("hidden");
}

function resetUpgradeSlot() {
    itemInUpgradeSlot = null;
    upgradeSlot.innerHTML = "";
    upgradeSlot.classList.remove("occupied");
    upgradeItemName.textContent = "---";
    upgradeCost.textContent = "Gerekli Yang: ---";
    upgradeSuccessChance.textContent = "Başarı Şansı: ---";
    upgradeButton.disabled = true;
    upgradeSlot.dataset.tooltip = "Eşyayı buraya sürükle";
}

// --- YENİ EKLENDİ (HEDEF MENÜSÜ BUTONLARI) ---
    if (targetPlayerMenuCloseBtn) {
        targetPlayerMenuCloseBtn.onclick = closeTargetPlayerMenu;
    }
    
    if (targetActionWhisper) {
        targetActionWhisper.onclick = () => {
            if (selectedTargetPlayerId && players[selectedTargetPlayerId]) {
                const targetName = players[selectedTargetPlayerId].name;
                
                // Sohbet kutusunu aç ve fısıltı komutunu hazırla
                chatInput.focus();
                chatInput.value = `/w ${targetName} `; // Fısıltı komutu
                
                closeTargetPlayerMenu();
            }
        };
    }
    
    if (targetActionInvite) {
        targetActionInvite.onclick = () => {
            if (selectedTargetPlayerId && players[selectedTargetPlayerId]) {
                socket.emit("inviteToParty", selectedTargetPlayerId);
                // TODO: Sunucuya 'parti daveti' gönder
                showWarnPanel(`Parti daveti gönderildi: ${players[selectedTargetPlayerId].name} (Henüz kodlanmadı)`);
                closeTargetPlayerMenu();
            }
        };
    }
    
    if (targetActionTrade) {
        targetActionTrade.onclick = () => {
            if (selectedTargetPlayerId && players[selectedTargetPlayerId]) {
                // --- GÜNCELLEME ---
                // Sunucuya 'ticaret daveti' gönder
                socket.emit("requestTrade", selectedTargetPlayerId);
                // showWarnPanel(`Ticaret daveti gönderildi: ${players[selectedTargetPlayerId].name} (Henüz kodlanmadı)`); // Eski kod
                // --- GÜNCELLEME SONU ---
                closeTargetPlayerMenu();
            }
        };

    if (partyLeaveBtn) {
        partyLeaveBtn.onclick = leaveParty;
    }
    if (partyInviteAccept) {
        partyInviteAccept.onclick = () => {
            if (currentInviterId) {
                socket.emit("acceptPartyInvite", { inviterId: currentInviterId });
                closePartyInvite();
            }
        };
    }
    if (partyInviteDecline) {
        partyInviteDecline.onclick = () => {
            if (currentInviterId) {
                socket.emit("declinePartyInvite", { inviterId: currentInviterId });
                closePartyInvite();
            }
        };
    }
    if (partyInviteDecline) {
        partyInviteDecline.onclick = () => {
            if (currentInviterId) {
                socket.emit("declinePartyInvite", { inviterId: currentInviterId });
                closePartyInvite();
            }
        };
    }

    // } // <-- BU SATIR SENİN DOSYANDA 1594. SATIRDA OLMALI (veya olmayabilir, if bloğunun bittiği yer)


    // --- YENİ: TİCARET DAVET BUTONLARI (BURAYA EKLE) ---
    if (tradeRequestAccept) {
        tradeRequestAccept.onclick = () => {
            if (currentTradeRequesterId) {
                socket.emit("acceptTrade", currentTradeRequesterId);
                closeTradeRequest();
            }
        };
    }
    
    if (tradeRequestDecline) {
        tradeRequestDecline.onclick = () => {
             if (currentTradeRequesterId) {
                socket.emit("declineTrade", currentTradeRequesterId);
                closeTradeRequest();
            }
        };
    }
    }


// Demirci paneli eventlerini (sürükle-bırak, tıkla) ayarlar
function setupBlacksmithListeners() {
    // Kapatma butonu
    document.getElementById("blacksmithPanelCloseBtn").onclick = closeBlacksmithWindow;

    // Drop alanı
    upgradeSlot.addEventListener("dragover", allowDrop); // (allowDrop zaten var)
    upgradeSlot.addEventListener("drop", handleBlacksmithDrop);

    // Yükselt butonu
    upgradeButton.onclick = () => {
        if (itemInUpgradeSlot) {
            socket.emit("attemptUpgrade", { inventoryIndex: itemInUpgradeSlot.index });
            upgradeButton.disabled = true; // İsteği tekrarlamayı engelle
            upgradeButton.textContent = "Yükseltiliyor...";
        }
    };
}

// Demirci slotuna eşya bırakıldığında çalışır
function handleBlacksmithDrop(e) {
    e.preventDefault();
    if (itemInUpgradeSlot) {
        showWarnPanel("Demirci slotu zaten dolu.");
        return;
    }

    let data = null;
    try {
        const rawData = e.dataTransfer.getData("text/inventory");
        if (!rawData) return;
        data = JSON.parse(rawData);
    } catch (error) { return; } 

    if (!data || data.type !== "inventory") return;

    const inventoryIndex = parseInt(data.index);
    const item = inventory[inventoryIndex];

    if (!item) return;

    // --- YENİ GÜNCELLEME ---
    // Tüm UI mantığını (icon, info, button) yeni fonksiyona devret
    updateBlacksmithUI(item, inventoryIndex);
    // --- GÜNCELLEME SONU ---
}

function showPartyInvite(data) {
    if (!partyInvitePanel) return;
    currentInviterId = data.inviterId;
    document.getElementById("partyInviteMessage").textContent = `Oyuncu '${data.inviterName}' sizi partisine davet ediyor.`;
    partyInvitePanel.classList.remove("hidden");
    
    // Diğer açık menüleri kapat
    closeTargetPlayerMenu();
}

function closePartyInvite() {
    currentInviterId = null;
    partyInvitePanel.classList.add("hidden");
}

function leaveParty() {
    socket.emit("leaveParty");
}

// =================================================================
// ### HATA BURADA OLABİLİR (1) ###
// Bu fonksiyonun ekli olduğundan emin ol
// =================================================================
function kickPlayer(targetPlayerId) {
    socket.emit("kickFromParty", targetPlayerId);
}

// =================================================================
// ### HATA BURADA OLABİLİR (2) ###
// Bu fonksiyonun 'kickButton' satırının 'onclick' içerdiğinden emin ol
// Gerekirse bu fonksiyonun tamamını kopyalayıp eskisiyle değiştir:
// =================================================================
function updatePartyUI() {
    if (!myParty || myParty.members.length <= 1) {
        partyPanel.classList.add("hidden"); // Parti yoksa veya tek kişiyse paneli gizle
        return;
    }
    
    partyPanel.classList.remove("hidden");
    partyMemberList.innerHTML = ""; // Listeyi temizle
    
    const amILeader = myParty.leader === mySocketId;

    myParty.members.forEach(memberId => {
        const member = players[memberId];
        if (!member) return; 

        const isLeader = myParty.leader === memberId;
        const isMe = memberId === mySocketId;
        
        // --- BURASI DEĞİŞTİ (HTML metni yerine element oluşturma) ---
        
        // 1. Ana üye kutusunu oluştur
        const memberDiv = document.createElement("div");
        memberDiv.className = isLeader ? "party-member leader" : "party-member normal";
        
        // 2. (GEREKİRSE) Atma Butonunu Oluştur
        if (amILeader && !isMe) {
            const kickButton = document.createElement("button");
            kickButton.className = "party-kick-btn";
            kickButton.title = "At";
            kickButton.textContent = "X";
            
            // ### ÇÖZÜM: Olayı metin olarak değil, doğrudan ata ###
            kickButton.onclick = () => {
                kickPlayer(memberId);
            };
            
            memberDiv.appendChild(kickButton); // Butonu üye kutusuna ekle
        }

        // 3. İsim elementini oluştur ve ekle
        const nameDiv = document.createElement("div");
        nameDiv.className = "party-member-name";
        nameDiv.textContent = `${isLeader ? '★ ' : ''}${member.name}`;
        memberDiv.appendChild(nameDiv);

        // 4. HP Bar elementlerini oluştur ve ekle
        const barDiv = document.createElement("div");
        barDiv.className = "party-member-bar";
        
        const hpDiv = document.createElement("div");
        hpDiv.className = "hp";
        hpDiv.style.width = `${(member.hp / member.maxHp) * 100}%`;
        
        barDiv.appendChild(hpDiv);
        memberDiv.appendChild(barDiv);

        // 5. Tamamlanan üye kutusunu listeye ekle
        partyMemberList.appendChild(memberDiv);
        
        // --- DEĞİŞİKLİK SONU ---
    });
}

/**
 * '1'-'6' tuşlarına basıldığında beceriyi kullanma isteği gönderir.
 */
function handleSkillUse(key) {
    const slotIndex = ACTION_SLOT_KEYS.indexOf(key); 
    if (slotIndex === -1) return;

    useActionBarSlot(slotIndex);
}


/**
 * Beceri yuvası üzerine bekleme süresi (cooldown) animasyonu koyar.
 */
function showCooldown(slotIndex, duration) {
    const slot = document.querySelector(`.action-slot[data-slot="${slotIndex + 1}"]`);

    if (!slot) return;

    const existingOverlay = slot.querySelector(".cooldown-overlay");
    if (existingOverlay) {
        existingOverlay.remove();
    }

    const overlay = document.createElement("div");
    overlay.className = "cooldown-overlay";
    
    overlay.style.animationName = "cooldownAnimation";
    overlay.style.animationDuration = `${duration / 1000}s`;
    
    slot.appendChild(overlay);

    setTimeout(() => {
        overlay.remove();
    }, duration);
}

/**
 * Ekranın ortasında kısa süreli bir uyarı mesajı gösterir.
 */
function showWarnPanel(message) {
    const panel = document.getElementById("warnPanel");
    const textEl = document.getElementById("warnPanelText");
    if (!panel || !textEl) return;

    if (warnPanelTimer) {
        clearTimeout(warnPanelTimer);
        panel.classList.remove("show");
    }

    textEl.textContent = message;

    panel.classList.remove("hidden");
    setTimeout(() => {
        panel.classList.add("show");
    }, 10); 

    warnPanelTimer = setTimeout(() => {
        panel.classList.remove("show");
        setTimeout(() => panel.classList.add("hidden"), 300); 
    }, 2000); 
}

// --- KARAKTER SEÇİM EKRANI MANTIĞI ---

function renderCharacterSelectionScreen(characters) {
    characterListEl.innerHTML = ""; 
    selectedCharacterName = null; // KRİTİK: Seçim ekranı açılınca sıfırlanır.

    document.getElementById("charSlotCount").textContent = `${characters.length}/${MAX_CHAR_SLOTS}`;
    selectCharBtn.disabled = true;
    
    // 1. Var olan karakterleri listele
    characters.forEach(charName => {
        // Sunucudan gelen karakter listesi sadece isim içerdiği için client'taki localStorage'a dayanmak risklidir.
        // Şimdilik sadece isim gösterilir, level/sınıf sunucudan gelene kadar '?' kalır.
        const charData = JSON.parse(localStorage.getItem(`char_${charName}`)) || {};
        
        const btn = document.createElement("button");
        btn.className = "choice-btn character-card";
        btn.textContent = `${charName} (Lv. ${charData.level || '?'}, ${charData.class || '?'})`;
        btn.dataset.name = charName;
        
        btn.onclick = (e) => {
            characterListEl.querySelectorAll(".character-card").forEach(b => b.classList.remove("selected"));
            e.target.classList.add("selected");
            
            // KRİTİK: Seçilen karakteri kaydet
            selectedCharacterName = charName; 
            
            selectCharBtn.disabled = false;
        };
        characterListEl.appendChild(btn);
    });

    // 2. Slot limitini kontrol et
    if (characters.length < MAX_CHAR_SLOTS) {
        const newCharBtn = document.createElement("button");
        newCharBtn.className = "choice-btn new-char-slot";
        newCharBtn.textContent = "Yeni Karakter Slotu (+)";
        newCharBtn.onclick = () => {
            characterSelectionScreen.classList.add("hidden");
            creationScreen.classList.remove("hidden");
        };
        characterListEl.appendChild(newCharBtn);
        createCharBtn.classList.add("hidden"); 
    } else {
         createCharBtn.classList.remove("hidden"); 
         createCharBtn.textContent = `Yeni Karakter Oluştur (Max: ${MAX_CHAR_SLOTS})`;
         createCharBtn.disabled = true;
    }
}


// --- GİRİŞ/SEÇİM BUTON DİNLEYİCİLERİ ---

selectCharBtn.addEventListener("click", () => {
    if (selectedCharacterName) {
        // Var olan karaktere giriş yapma isteği
        // KRİTİK DÜZELTME: Sadece isim gönderilir, sunucu bu karakteri yükler.
        socket.emit("createOrJoinCharacter", { 
            name: selectedCharacterName,
        });
    } else {
        showWarnPanel("Lütfen bir karakter seçin.");
    }
});

// Yeni karakter oluşturma ekranındaki "Oyuna Başla" butonu (creationScreen)
startGameBtn.addEventListener("click", () => {
    playerChoices.name = playerNameInput.value.trim();
    if (!playerChoices.name || !playerChoices.kingdom || !playerChoices.class) {
        showWarnPanel("Lütfen tüm alanları doldurun!");
        return;
    }

    // Yeni karakter oluşturma isteği
    socket.emit("createOrJoinCharacter", playerChoices);
});


// --- SUNUCU HATA BİLDİRİMİ ---

socket.on("characterCreationFail", (message) => {
    showWarnPanel(message);
    if(message.includes("Maksimum karakter sayısına")) {
        creationScreen.classList.add("hidden");
        characterSelectionScreen.classList.remove("hidden");
    }
});

const CLIENT_SHOP_DB = {
    "v_merchant": [ 
        { itemId: 9001, stackable: true, maxStack: 99 }, 
        { itemId: 9101, stackable: true, maxStack: 1 }, 
        { itemId: 9102, stackable: true, maxStack: 1 }, 
        { itemId: 9103, stackable: true, maxStack: 1 }, 
        
        { itemId: 9011, stackable: true, maxStack: 99 }, 
        { itemId: 9111, stackable: true, maxStack: 1 }, 
        { itemId: 9112, stackable: true, maxStack: 1 }, 
        { itemId: 9113, stackable: true, maxStack: 1 }, 
        
    ]
};

function showShopWindow(npc) {
    const shopItems = CLIENT_SHOP_DB[npc.id];
    if (!shopItems) return;

    const shopPanel = document.getElementById("shopPanel");
    const shopList = document.getElementById("shopList");
    
    if (!shopPanel || !shopList) {
        console.error("Shop UI elementleri bulunamadı!");
        return;
    }
    
    shopList.innerHTML = "";
    
    shopItems.forEach(shopSlot => {
        const item = ITEM_DB[shopSlot.itemId];
        if (!item) return;

        const itemCost = item.buyPrice || 0;
        
        const row = document.createElement("div");
        row.className = "shop-item-row";
        
        const iconPath = item.type === 'consumable' 
            ? `/assets/merchants/${item.iconSrc}` 
            : `/assets/armors/${item.iconSrc}`; 
            
        row.innerHTML = `
            <div class="shop-icon">
                <img src="${iconPath}" alt="${item.name}">
            </div>
            <div class="shop-details">
                <div class="shop-name">${item.name}</div>
                <div class="shop-price">${itemCost.toLocaleString()} Yang</div>
            </div>
            <button class="buy-btn" data-item-id="${item.id}" data-price="${itemCost}">Satın Al</button>
        `;
        shopList.appendChild(row);
    });

    shopList.querySelectorAll(".buy-btn").forEach(btn => {
        btn.onclick = () => {
            const itemId = parseInt(btn.dataset.itemId);
            const itemCost = parseFloat(btn.dataset.price); 
            const quantity = 1; 

            socket.emit("buyItem", { itemId: itemId, quantity: quantity });
        };
    });

    updateSellPanelUI(); 
    
    shopPanel.classList.remove("hidden");
}

function updateSellPanelUI() {
    const sellList = document.getElementById("sellList");
    if (!sellList) return;
    
    sellList.innerHTML = ""; 
    let sellableItemCount = 0;

    inventory.forEach((item, index) => {
        if (!item || !item.sellPrice || item.sellPrice <= 0) return; 

        sellableItemCount++;

        const sellPrice = item.sellPrice;

        const row = document.createElement("div");
        row.className = "sell-item-row";
        
        let iconPath = '';
        if (item.iconSrc) {
            if (item.type === 'weapon') {
                iconPath = `/assets/weapons/${item.iconSrc}`;
            } else if (item.type === 'consumable') { 
                iconPath = `/assets/merchants/${item.iconSrc}`;
            } else { 
                iconPath = `/assets/armors/${item.iconSrc}`; 
            }
        }
        
        row.innerHTML = `
            <div class="shop-icon">
                ${iconPath ? `<img src="${iconPath}" alt="${item.name}">` : getItemSVG(item.icon)}
            </div>
            <div class="shop-details">
                <div class="shop-name">${item.name} ${item.quantity ? ' (x' + item.quantity + ')' : ''}</div>
                <div class="shop-price">${sellPrice.toLocaleString()} Yang</div>
            </div>
            <button class="sell-btn" data-item-id="${item.id}" data-index="${index}">Sat</button>
        `;
        sellList.appendChild(row);
    });

    if (sellableItemCount === 0) {
        sellList.innerHTML = `<div style="text-align: center; padding: 20px; color: #aaa;">Envanterinizde satılabilecek bir eşya bulunmamaktadır. (Satış fiyatı 0 olan eşyalar hariç)</div>`;
    }

    sellList.querySelectorAll(".sell-btn").forEach(btn => {
        btn.onclick = () => {
            const itemId = parseInt(btn.dataset.itemId);
            const inventoryIndex = parseInt(btn.dataset.index);
            socket.emit("sellItem", { itemId: itemId, inventoryIndex: inventoryIndex });
        };
    });
}

/**
 * Gelen mesajı alır ve sohbet kutusuna ekler.
 * type: 'system', 'general', 'error'
 * sender: (Opsiyonel) Gönderenin adı
 * message: Mesaj metni
 */
function addMessageToChat(data) {
    if (!chatMessages) return;

    const { type = 'general', sender, message, target } = data;
    
    const msgDiv = document.createElement("div");
    msgDiv.classList.add("chat-msg");
    
    let htmlContent = "";

    if (type === 'system') {
        msgDiv.classList.add("system");
        htmlContent = `[Sistem] ${message}`;
    } else if (type === 'error') {
        msgDiv.classList.add("error");
        htmlContent = `[Hata] ${message}`;
        
    // =================================================================
    // ### YENİ EKLENEN FISILTI BLOKLARI ###
    // =================================================================
    } else if (type === 'whisper_sent') {
        msgDiv.classList.add("whisper"); // Yeni CSS sınıfı
        // Gönderdiğimiz fısıltı (hedef oyuncunun adını gösterir)
        htmlContent = `<strong>-> [${target}]:</strong> ${message}`;
        
    } else if (type === 'whisper_received') {
        msgDiv.classList.add("whisper"); // Yeni CSS sınıfı
        // Aldığımız fısıltı (gönderen oyuncunun adını gösterir)
        htmlContent = `<strong>[${sender}] ->:</strong> ${message}`;
    // =================================================================
    // ### YENİ BLOKLAR SONU ###
    // =================================================================

    } else { // 'general'
        // Normal genel sohbet
        htmlContent = `<strong>${sender}:</strong> ${message}`;
    }
    
    msgDiv.innerHTML = htmlContent;
    chatMessages.appendChild(msgDiv);
    
    // Otomatik olarak en alta kaydır
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * Sohbet giriş kutusuna (chatInput) 'Enter' dinleyicisi ekler.
 */
function setupChatListener() {
    if (!chatInput) return;

    chatInput.addEventListener("keydown", (e) => {
        // Sadece 'Enter' tuşuna basıldığında
        if (e.key === "Enter") {
            e.preventDefault(); // Sayfanın yenilenmesini engelle
            
            const message = chatInput.value.trim();
            
            if (message.length > 0) {
                // Mesaj varsa, sunucuya gönder
                socket.emit("sendChatMessage", { message: message });
                
                // Gönderdikten sonra kutuyu temizle
                chatInput.value = "";
            }
            
            // =================================================================
            // ### DÜZELTME BURADA ###
            // Mesaj gönderilsin VEYA gönderilmesin (kutu boşsa),
            // 'Enter'a basıldığında her zaman odaktan çık (blur).
            // Bu satır 'if' bloğunun DIŞINDA olmalı.
            chatInput.blur();
            // =================================================================
        }
    });
}

// client.js
function setupInputListeners() {
    if (inputListenersInitialized) {
        console.warn("Input listener'lar zaten kurulmuş. Tekrar kurma engellendi.");
        return;
    }
    
    inputListenersInitialized = true; 

    canvas.addEventListener("click", handleWorldClick);
    
    window.addEventListener("keydown", (e) => {
        const me = players[mySocketId];
        const key = e.key.toLowerCase(); // Tuşu en başta alalım

        // =================================================================
        // ### ESC TUŞU MANTIĞI ###
        // =================================================================
        if (key === 'escape') {
            e.preventDefault(); // Varsayılan ESC eylemlerini engelle
            
            // 1. Öncelik: Sohbetten çık
            if (document.activeElement === chatInput) {
                chatInput.blur();
                return;
            }

            if (partyInvitePanel && !partyInvitePanel.classList.contains("hidden")) {
                closePartyInvite();
                return;
            }
            
            
            // 2. Öncelik: Açık panelleri kapat (birini bulduğu an durur)
            // (NOT: Bu elementlerin en üstte tanımlı olması gerekir)
            if (skillChoiceWindow && !skillChoiceWindow.classList.contains("hidden")) {
                skillChoiceWindow.classList.add("hidden");
                return;
            }
            if (blacksmithPanel && !blacksmithPanel.classList.contains("hidden")) {
                closeBlacksmithWindow(); // Demirci'nin özel kapatma fonksiyonu var
                return;
            }
            if (shopPanel && !shopPanel.classList.contains("hidden")) {
                shopPanel.classList.add("hidden");
                return;
            }
            if (inventoryPanel && !inventoryPanel.classList.contains("hidden")) {
                inventoryPanel.classList.add("hidden");
                return;
            }
            if (characterPanel && !characterPanel.classList.contains("hidden")) {
                characterPanel.classList.add("hidden");
                return;
            }
            if (skillPanel && !skillPanel.classList.contains("hidden")) {
                skillPanel.classList.add("hidden");
                return;
            }
            
            return; // ESC başka bir işlev yapmasın
        }
        // =================================================================


        // Enter'a basıldığında ve chat kutusu odaklı DEĞİLSE (Sohbete odaklan)
        if (key === 'enter' && document.activeElement !== chatInput) {
            e.preventDefault(); 
            chatInput.focus(); 
            return; 
        }
        
        // Eğer odak chatInput'taysa, hiçbir oyun tuşunu çalıştırma
        if (document.activeElement === chatInput) {
            return;
        }
        
        // --- Buradan sonrası oyun mekanikleri (Hareket, Beceri vb.) ---
        
        if (!me || !me.isAlive) { e.preventDefault(); return; }
        if (e.target.tagName === 'INPUT') return;
        
        // Hareket tuşları
        if (keysPressed[key] !== undefined && !keysPressed[key]) {
            keysPressed[key] = true;
            socket.emit("keyStateChange", { key, pressed: true });
            e.preventDefault();
        }
        // Saldırı tuşu
        if (key === ' ') {
            socket.emit("attack");
            e.preventDefault();
        }

        // =======================================================
        // ### DÜZELTME: EKSİK KISAYOL KODU ###
        // =======================================================
        if (ACTION_SLOT_KEYS.includes(key)) {
            handleSkillUse(key); // Fonksiyonu çağır
            e.preventDefault();
        }
        // =======================================================
        // ### DÜZELTME SONU ###
        // =======================================================

       // Panel tuşları
       if (key === 'i') {
            if (inventoryPanel) {
                inventoryPanel.classList.toggle("hidden");
            }
            e.preventDefault();
        }
        if (key === 'k') {
            if (skillPanel) { // <-- DEĞİŞTİ
                skillPanel.classList.toggle("hidden");
                // Panel açılıyorsa UI'ı güncelle
                if (!skillPanel.classList.contains("hidden")) { 
                    updateSkillPanelUI();
                }
            }
            e.preventDefault();
        }
        if (key === 'c') {
            if (characterPanel) { // <-- DEĞİŞTİ
                characterPanel.classList.toggle("hidden");
                // Panel açılıyorsa UI'ı güncelle
                if (!characterPanel.classList.contains("hidden")) { 
                    updateCharacterPanelUI();
                }
            }
            e.preventDefault();
        }
    });

    // =================================================================
    // ### YENİ EKLENEN 'keyup' DİNLEYİCİSİ (Yürüme Hatası Düzeltmesi) ###
    // =================================================================
    window.addEventListener("keyup", (e) => {
        const key = e.key.toLowerCase();
        
        // 1. Önce, bırakılan tuşun bir hareket tuşu olup olmadığını kontrol et.
        if (keysPressed[key] !== undefined) {
            
            // Eğer bir hareket tuşuysa ('w', 'a', 's', 'd'),
            // odak nerede olursa olsun (sohbette bile olsak)
            // 'pressed' durumunu 'false' yap ve sunucuya bildir.
            // Bu, karakterin takılı kalmasını engeller.
            
            keysPressed[key] = false;
            socket.emit("keyStateChange", { key, pressed: false });
        }

        // 2. Artık 'INPUT' kontrolünü yapabiliriz.
        // Eğer odak bir 'INPUT' içindeyse, (hareket tuşları dışındaki)
        // başka bir 'keyup' eylemini engelle.
        if (e.target.tagName === 'INPUT') {
            return;
        }
    });
    // =================================================================
    // ### YENİ 'keyup' DİNLEYİİSİ SONU ###
    // =================================================================

    // Diğer dinleyicileri ayarla
    setupBlacksmithListeners(); // Demirci panelini ayarla
    setupChatListener(); // Sohbet girişini (Enter) ayarla

    // Panel kapatma butonları
    const skillPanelCloseBtn = document.getElementById("skillPanelCloseBtn");
    if(skillPanelCloseBtn) {
        skillPanelCloseBtn.onclick = toggleSkillPanel;
    }

    const charPanelCloseBtn = document.getElementById("characterPanelCloseBtn");
    if(charPanelCloseBtn) {
        charPanelCloseBtn.onclick = toggleCharacterPanel;
    }

    const shopPanelCloseBtn = document.getElementById("shopPanelCloseBtn");
    if(shopPanelCloseBtn) {
        shopPanelCloseBtn.onclick = () => {
            document.getElementById("shopPanel").classList.add("hidden");
        };
    }

    // Mağaza (Shop) Tab'ları
    document.querySelectorAll(".shop-tabs .tab-btn").forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll(".shop-tabs .tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".shop-tab").forEach(tab => tab.classList.add("hidden"));
            
            btn.classList.add("active");
            document.getElementById(btn.dataset.tab + "Tab").classList.remove("hidden");
            
            if (btn.dataset.tab === 'sell') {
                updateSellPanelUI();
            }
        };
    });
}
   
// --------------------------- ANİMASYON (Aynı Kaldı) ---------------------------
// ... (client.js'in 1100. satırına kadarki animasyon, çizim, minimap, gameLoop, initializeGameGraphics fonksiyonları aynı kalmıştır)

function updateAnimations() {
    const now = Date.now(); 

    // 1. OYUNCU ANİMASYONLARI (Aynı Kalır)
    for (const id in players) {
        const p = players[id];
        if (!p) continue;

        if (!animData[id]) {
            animData[id] = { animFrame: 0, animTicker: 0, prevAnimState: p.animState, slashStartTime: 0 };
        }

        const ad = animData[id];
        const classAsset = assetDefinitions[p.class];
        if (!classAsset) continue;

        if (ad.prevAnimState !== p.animState) {
            ad.animFrame = 0;
            ad.animTicker = 0;
            if (p.animState === "slash") ad.slashStartTime = now;
            ad.prevAnimState = p.animState;
        }

        let tickSpeed, frames;
        const stateAsset = classAsset[p.animState];
        
        if (!stateAsset) {
             tickSpeed = 30; 
             frames = classAsset.idle.frames;
        } else {
             frames = stateAsset.frames;
        }

        if (p.animState === "slash") {
            tickSpeed = 6;
            frames = stateAsset.frames; 
            if (now - ad.slashStartTime > 500) {
                socket.emit("slashFinished", { playerId: id });
            }
        } else if (p.animState === "walk") {
            tickSpeed = 5;
        } else if (p.animState === "hurt") {
            tickSpeed = 10;
            frames = stateAsset.frames; 
            if (ad.animFrame >= frames - 1) {
                ad.animTicker = 0;
                continue; 
            }
        } else { // idle
            tickSpeed = 30;
        }

        // --- HATA BURADAYDI - DÜZELTİLDİ ---
        // 'currentStateKey' kullanan 'if' bloğu kaldırıldı
        // ve sadece normal animasyon döngüsü bırakıldı.
        ad.animTicker++;
        if (ad.animTicker >= tickSpeed) {
            ad.animTicker = 0;
            const currentFrames = stateAsset ? stateAsset.frames : classAsset.idle.frames;
            ad.animFrame = (ad.animFrame + 1) % currentFrames;
        }
        // --- DÜZELTME SONU ---
    }


    // 2. MOB ANİMASYONLARI (Bu bölüm doğruydu, aynı kalır)
    for (const id in mobs) {
        const p = mobs[id];
        if (!p.asset) continue; 
        
        const mobId = `mob_${id}`;
        if (!animData[mobId]) {
            animData[mobId] = { 
                animFrame: 0, 
                animTicker: 0, 
                prevAnimState: "idle", 
                direction: "down",
                hurtPlayed: false    
            };
        }

        const ad = animData[mobId];
        const mobAsset = assetDefinitions[p.asset];
        if (!mobAsset) continue;
        
        const isSingleSheet = !!mobAsset.animations; 
        
        let currentStateKey = "idle";
        
        let mobConfig = isSingleSheet ? mobAsset.animations.idle : mobAsset.idle;
        
        if (!p.isAlive) {
            currentStateKey = "hurt";
        } 
        else if (p.targetId && players[p.targetId]) {
             const target = players[p.targetId];
             const mobAttackRange = p.attackRange || 50; 
             const dist = distance({x: p.x, y: p.y, width: p.width, height: p.height}, target); 
             
             if (dist <= mobAttackRange * 1.5) { 
                 currentStateKey = "attack";
             } else {
                 currentStateKey = "walk";
             }
             
             const angle = Math.atan2(target.y - p.y, target.x - p.x);
             if (angle >= -Math.PI / 4 && angle <= Math.PI / 4) ad.direction = "right";
             else if (angle > Math.PI / 4 && angle <= 3 * Math.PI / 4) ad.direction = "down";
             else if (angle < -Math.PI / 4 && angle >= -3 * Math.PI / 4) ad.direction = "up";
             else ad.direction = "left";
        }
        
        if (isSingleSheet) { 
            const animConfig = mobAsset.animations[currentStateKey];
            if (animConfig) mobConfig = animConfig;
        } else { 
            const state = mobAsset[currentStateKey];
            if (state) mobConfig = state;
        }

        if (!mobConfig) continue; 

        const tickSpeed = mobConfig.speed || p.idleSpeed || 30;
        const frames = mobConfig.totalFrames || mobConfig.frames; 

        if (ad.prevAnimState !== currentStateKey) {
            ad.animFrame = 0;
            ad.animTicker = 0;
            ad.prevAnimState = currentStateKey;
        }
        
        if (currentStateKey === "hurt" && ad.hurtPlayed) {
            // Animasyonu son karede (frames - 1) dondur
            ad.animFrame = frames - 1; 
        } else {
            // Normal animasyon döngüsü
            ad.animTicker++;
            if (ad.animTicker >= tickSpeed) {
                ad.animTicker = 0;
                ad.animFrame = (ad.animFrame + 1) % frames;
                
                // Animasyon son kareye ulaştıysa 'hurtPlayed' olarak işaretle
                if (currentStateKey === "hurt" && ad.animFrame === frames - 1) {
                    ad.hurtPlayed = true;
                }
            }
        }
        
        p.direction = ad.direction; 
        p.animState = currentStateKey;
    }
}

// --------------------------- MINIMAP ---------------------------
function updateMinimap() {
    if (!miniCtx || !players || !npcs || !mySocketId) return;

    const me = players[mySocketId];
    if (!me) return;

    const mapData = CLIENT_MAP_DATA[me.map];
    if (!mapData) return;

    const scaleX = miniCanvas.width / mapData.width;
    const scaleY = miniCanvas.height / mapData.height;

    // Temizle
    miniCtx.fillStyle = "#000";
    miniCtx.fillRect(0, 0, miniCanvas.width, miniCanvas.height);

    // Harita arka planı
    const bg = loadedImages[mapData.src];
    if (bg) {
        miniCtx.drawImage(bg, 0, 0, miniCanvas.width, miniCanvas.height);
        miniCtx.fillStyle = "rgba(0,0,0,0.75)";
        miniCtx.fillRect(0, 0, miniCanvas.width, miniCanvas.height);
    } else {
        miniCtx.fillStyle = "#111";
        miniCtx.fillRect(0, 0, miniCanvas.width, miniCanvas.height);
    }

    const kingdomColors = { shinsoo: "#FF4444", jinno: "#4444FF", chunjo: "#44FF44" };

    // NPC'ler (yeşil)
    miniCtx.fillStyle = "#00FF88";
    for (const id in npcs) {
        const npc = npcs[id];
        if (npc.map !== me.map) continue;
        const x = npc.x * scaleX, y = npc.y * scaleY;
        miniCtx.beginPath();
        miniCtx.arc(x, y, 2.5, 0, Math.PI * 2);
        miniCtx.fill();
    }

    // Moblar (soluk kırmızı)
    miniCtx.fillStyle = "rgba(255, 100, 100, 0.7)";
    for (const id in mobs) {
        const mob = mobs[id];
        if (mob.map !== me.map || !mob.isAlive) continue;
        const x = mob.x * scaleX, y = mob.y * scaleY;
        miniCtx.beginPath();
        miniCtx.arc(x, y, 2, 0, Math.PI * 2);
        miniCtx.fill();
    }

    // Portallar (sarı kare)
    miniCtx.fillStyle = "#FFFF00";
    portals.forEach(p => {
        if (p.map !== me.map) return;
        const x = p.x * scaleX, y = p.y * scaleY;
        const size = 5;
        miniCtx.fillRect(x - size/2, y - size/2, size, size);
    });

    // Oyuncular
    for (const id in players) {
        const p = players[id];
        if (p.map !== me.map) continue;
        const color = kingdomColors[p.kingdom] || "#FFFFFF";
        const x = p.x * scaleX, y = p.y * scaleY;
        const radius = (id === mySocketId) ? 4.5 : 2;

        miniCtx.fillStyle = color;
        miniCtx.beginPath();
        miniCtx.arc(x, y, radius, 0, Math.PI * 2);
        miniCtx.fill();

        if (id === mySocketId) {
            miniCtx.strokeStyle = "#FFFFFF";
            miniCtx.lineWidth = 1.5;
            miniCtx.stroke();
        }
    }
}

// --------------------------- ÇİZİM ---------------------------
let gameLoopStarted = false;

function draw() {
    if (!gameLoopStarted) {
        ctx.fillStyle = "black"; ctx.fillRect(0, 0, canvas.width, canvas.height); return;
    }
    
    const me = players[mySocketId];
    if (!me) {
        ctx.fillStyle = "black"; ctx.fillRect(0, 0, canvas.width, canvas.height); return;
    }

    const map = CLIENT_MAP_DATA[me.map];
    if (!map) return;

    const logicalWidth = canvas.width / (window.devicePixelRatio || 1);
    const logicalHeight = canvas.height / (window.devicePixelRatio || 1);

    // Kamera
    camera.x = Math.max(0, Math.min(me.x + me.width / 2 - logicalWidth / 2, map.width - logicalWidth));
    camera.y = Math.max(0, Math.min(me.y + me.height / 2 - logicalHeight / 2, map.height - logicalHeight));

    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    // HARİTA
    const bg = loadedImages[map.src];
    if (bg) ctx.drawImage(bg, 0, 0, map.width, map.height);

    // PORTAL ALANLARI (mavi-yarı saydam kare)
    ctx.fillStyle = "rgba(0, 150, 255, 0.3)";
    ctx.strokeStyle = "#00AAFF";
    ctx.lineWidth = 2;
    portals.forEach(p => {
        if (p.map !== me.map) return;
        const w = p.width || 100, h = p.height || 100;
        ctx.fillRect(p.x - w/2, p.y - h/2, w, h);
        ctx.strokeRect(p.x - w/2, p.y - h/2, w, h);
    });

    // MOBLAR
    for (const id in mobs) {
        const mob = mobs[id];
        if (mob.map !== me.map) continue;
        
        const mobId = `mob_${id}`;
        const mobAnimData = animData[mobId]; 
        
        const mobAsset = mob.asset ? assetDefinitions[mob.asset] : null;
        // YENİ: Ölüm animasyonu ve 2 saniye bekleme
        let isFadingOut = false;
        if (!mob.isAlive) {
            const now = Date.now();
            // Sunucudan gelen deathTime'ı kullan
            const deathTime = mob.deathTime || (now - MOB_RESPAWN_TIME); // (Eğer deathTime henüz gelmediyse 10sn geçmiş varsay)
            const timeSinceDeath = now - deathTime;

            if (timeSinceDeath > 2000) {
                // 2 saniye geçti, artık çizmeyi bırak
                continue;
            }
            
            isFadingOut = true;
            // 2 saniye boyunca yavaşça sol (fade-out)
            ctx.globalAlpha = 1.0 - (timeSinceDeath / 2000);
        }
        // --- YENİ KOD SONU ---

        if (mobAsset) {
            
            const currentStateKey = mob.animState || "idle";
            
            
            
            if (!mobAnimData) continue; 
            
            const isSingleSheet = !!mobAsset.animations; 
            
            let state;
            let img;
            let sourceSheetRow = 0; 

            if (isSingleSheet) {
                const animConfig = mobAsset.animations[currentStateKey];
                if (!animConfig) continue;
                
                state = mobAsset; 
                img = loadedImages[mobAsset.src];

                sourceSheetRow = directionRowMap[mob.direction] || 0;
                sourceSheetRow += (animConfig.rowOffset || 0); 
                
                var frameX = animConfig.startFrameX * state.frameWidth; 
                frameX += mobAnimData.animFrame * state.frameWidth;

            } else {
                state = mobAsset[currentStateKey] || mobAsset["idle"];
                img = loadedImages[state.src];
                sourceSheetRow = directionRowMap[mob.direction] || 0;
                
                var frameX = mobAnimData.animFrame * state.frameWidth;
            }

            if (!state || !img) continue;

            const hitbox = mobAsset.hitbox;

            if (currentStateKey === "hurt" && mobAnimData.hurtPlayed) {
                 frameX = ((isSingleSheet ? mobAsset.animations.hurt.startFrameX : state.frames) - 1) * state.frameWidth;
            }

            const frameY = sourceSheetRow * state.frameHeight;
            
            const drawX = mob.x + (mob.width / 2) - state.pivotX;
            const drawY = mob.y + (mob.height / 2) - state.pivotY;

            ctx.drawImage(img, frameX, frameY, state.frameWidth, state.frameHeight, 
                          drawX, drawY, state.frameWidth, state.frameHeight);
            
            const hpPercent = (mob.hp / mob.maxHp) * 100;
            const barWidth = hitbox.width * 1.5; 
            const barX = mob.x + (mob.width / 2) - (barWidth / 2);
            const barY = mob.y - 15; 
            
            ctx.fillStyle = "red";
            ctx.fillRect(barX, barY, barWidth, 4);
            ctx.fillStyle = mob.color; 
            ctx.fillRect(barX, barY, (barWidth * hpPercent) / 100, 4);

            ctx.fillStyle = "white";
            ctx.font = "10px Arial";
            ctx.textAlign = "center";
            ctx.fillText(`${mob.type} Lv.${mob.level}`, mob.x + mob.width / 2, mob.y - 5);


        }
        
        // YENİ: Eğer bu mob için saydamlık kullandıysak, bir sonrakine geçmeden sıfırla
        if (isFadingOut) {
            ctx.globalAlpha = 1.0;
        }
    }
    
    // NPC'ler
    for (const id in npcs) {
        const p = npcs[id];
        if (p.map !== me.map) continue;
        
        const classAsset = assetDefinitions[p.asset];
        if (!classAsset) continue;

        const state = classAsset.idle; 
        if (!state) continue;
        
        const img = loadedImages[state.src];
        if (!img) continue;

        const frameX = p.animFrame * state.frameWidth;
        const frameY = (p.asset === "blacksmith" || p.asset === "merchant") ? 0 : (directionRowMap["down"] * state.frameHeight); 
        
        const frameW = state.frameWidth;
        const frameH = state.frameHeight;
        const pivotX = state.pivotX;
        const pivotY = state.pivotY;
        const drawW = state.drawWidth || frameW;
        const drawH = state.drawHeight || frameH;

        const drawX = p.x + (p.width / 2) - (drawW / 2);
        const drawY = p.y + p.height - drawH; 

        ctx.drawImage(img, frameX, frameY, frameW, frameH, drawX, drawY, drawW, drawH);

        ctx.fillStyle = "#00FF00";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";
        ctx.fillText(p.name, p.x + p.width / 2, p.y - 10);
    }
    
    // OYUNCULAR
    for (const id in players) {
        const p = players[id];
        if (p.map !== me.map) continue;
        
        if (!p.isAlive) { 
            ctx.globalAlpha = 0.5; 
        }
        
        const classAsset = assetDefinitions[p.class];
        if (!classAsset) continue;

        const state = classAsset[p.animState];
        if (!state) continue;
        
        const img = loadedImages[state.src];
        if (!img) continue;

        if (!animData[id]) {
             animData[id] = { animFrame: 0, animTicker: 0, prevAnimState: p.animState, slashStartTime: 0 };
        }
        const ad = animData[id]; 

        const hitbox = classAsset.hitbox;

        if (ad.prevHp === undefined) { ad.prevHp = p.hp; } 
        
        if (p.hp < ad.prevHp) { 
            ad.showHpBarUntil = Date.now() + 3000; 
        }
        ad.prevHp = p.hp; 

        if (ad.showHpBarUntil && Date.now() < ad.showHpBarUntil) {
            const hpPercent = Math.max(0, p.hp / p.maxHp);
            const barWidth = hitbox.width * 0.9; 
            const barX = p.x + (hitbox.width / 2) - (barWidth / 2); 
            const barY = p.y - 25; 

            ctx.fillStyle = "rgba(100, 0, 0, 0.7)";
            ctx.fillRect(barX, barY, barWidth, 6); 
            
            ctx.fillStyle = "rgba(0, 255, 0, 0.9)";
            ctx.fillRect(barX, barY, barWidth * hpPercent, 6);

            ctx.strokeStyle = "rgba(0, 0, 0, 0.9)";
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barWidth, 6);
        }

       let frameX = ad.animFrame * state.frameWidth;
        let frameY = 0;

        if (p.animState === "hurt") {
            frameY = 0; 
        } else {
            frameY = directionRowMap[p.direction] * state.frameHeight;
        }

        const drawX = p.x - state.pivotX + (hitbox.width / 2);
        const drawY = p.y - state.pivotY + (hitbox.height / 2);

        ctx.drawImage(img, frameX, frameY, state.frameWidth, state.frameHeight, drawX, drawY, state.frameWidth, state.frameHeight);

        ctx.fillStyle = "white";
        ctx.font = "12px Arial";
        ctx.textAlign = "center";
        ctx.fillText(p.name, p.x + hitbox.width / 2, p.y - 10);

      if (!p.isAlive) { 
                ctx.globalAlpha = 1.0; 
            }
        }

    ctx.restore(); 

} 

// --------------------------- OYUN DÖNGÜSÜ ---------------------------
function gameLoop() {
    if (!gameLoopStarted) return;
    updateAnimations();
    draw();
    updateMinimap(); 
    
    updateUI(); 
    updateCharacterPanelUI();
    updateBuffsUI();
    
    
    requestAnimationFrame(gameLoop);
}
// --------------------------- GRAFİK YÜKLEME ---------------------------
function initializeGameGraphics() {
    const sources = {};
    for (const c in assetDefinitions) {
        const a = assetDefinitions[c];
        
        if (a.walk && a.walk.src) sources[a.walk.src] = true;
        if (a.idle && a.idle.src) sources[a.idle.src] = true;
        if (a.slash && a.slash.src) sources[a.slash.src] = true;
        if (a.hurt && a.hurt.src) sources[a.hurt.src] = true; 
        if (a.attack && a.attack.src) sources[a.attack.src] = true; 
    }
    for (const m in CLIENT_MAP_DATA) sources[CLIENT_MAP_DATA[m].src] = true;

    let loaded = 0;
    const total = Object.keys(sources).length;
    let allLoaded = true;

    for (const src in sources) {
        const img = new Image();
        img.src = src;
        loadedImages[src] = img;
        img.onload = () => {
            loaded++;
            if (loaded === total && allLoaded) {
                console.log("Tüm varlıklar yüklendi!");
                gameLoopStarted = true;
                gameLoop();
                updateInventoryUI();
            }
        };
        img.onerror = () => {
            console.error('HATA: Resim yüklenemedi:', src);
            loaded++;
            allLoaded = false; 
            if (loaded === total) {
                alert("Oyun varlıkları yüklenemedi. 'assets' klasörünüzü kontrol edin. (Örn: " + src + ")");
            }
        };
    }
}

function updateBuffsUI() {
    const me = players[mySocketId];
    const panel = document.getElementById("buffsPanel");
    if (!me || !panel) return;

    const activeBuffs = me.activeBuffs || {};
    const now = Date.now();
    let panelContent = '';

    for (const skillId in activeBuffs) {
        const endTime = activeBuffs[skillId];
        const remainingTimeSeconds = Math.max(0, (endTime - now) / 1000); 

        if (remainingTimeSeconds > 0) {
            const skillData = CLIENT_SKILL_DB[skillId];
            if (!skillData || !skillData.icon) continue;

            const timeText = remainingTimeSeconds < 60
                ? remainingTimeSeconds.toFixed(1) 
                : Math.ceil(remainingTimeSeconds); 
            
            panelContent += `
                <div class="buff-icon" data-tooltip="${skillData.name}: ${timeText}s">
                    <img src="${skillData.icon}" alt="${skillData.name}">
                    <div class="countdown-overlay">${timeText}</div>
                </div>
            `;
        }
    }
    
    panel.innerHTML = panelContent;
}
// --- ACCOUNT LOGIC ---
showRegisterBtn.addEventListener("click", () => {
    registerForm.classList.toggle("hidden");
});

registerBtn.addEventListener("click", () => {
    const username = accountNameInput.value.trim();
    const password = passwordInput.value;
    const confirm = registerPasswordConfirm.value;

    if (!username || !password || !confirm) {
        showWarnPanel("Tüm alanları doldurmalısın.");
        return;
    }
    if (password !== confirm) {
        showWarnPanel("Şifreler uyuşmuyor.");
        return;
    }

    socket.emit("registerAttempt", { username, password });
});

loginBtn.addEventListener("click", () => {
    const username = accountNameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
        showWarnPanel("Kullanıcı adı ve şifre girmelisin.");
        return;
    }

    socket.emit("loginAttempt", { username, password });
});

// --- SUNUCU DÖNÜŞLERİ ---
socket.on("loginSuccess", (data) => {
    showWarnPanel("Giriş Başarılı! Karakterini seç/oluştur.");
    loginScreen.classList.add("hidden");        
    
    renderCharacterSelectionScreen(data.characters); 
    characterSelectionScreen.classList.remove("hidden");
});
socket.on("loginFail", (message) => {
    showWarnPanel(message);
});

socket.on("registerSuccess", () => {
    showWarnPanel("Kayıt Başarılı! Şimdi giriş yapabilirsin.");
    registerForm.classList.add("hidden"); 
});

// --------------------------- OYUN BAŞLATMA AKIŞI ---------------------------
function hideAllScreensAndStartGame() {
    // 1. Tüm giriş/oluşturma/seçim ekranlarını gizle
    loginScreen.classList.add("hidden"); 
    creationScreen.classList.add("hidden"); 
    characterSelectionScreen.classList.add("hidden"); // KRİTİK: Karakter seçim ekranı gizlenir.
    
    // 2. Oyun dünyasını göster
    gameWorld.classList.remove("hidden");   

    // 3. Oyunun başlatılması için gerekli adımları çağır
    setupUI(); 
    setupInputListeners(); 
    updateSkillBarUI();
    
    // 4. Grafikleri yükle ve ana oyun döngüsünü başlat
    initializeGameGraphics();
}
// SUNUCU ONAYI SONRASI OYUN BAŞLATMA
socket.on("characterJoined", () => {
    // Merkezi başlatma fonksiyonunu çağır
    hideAllScreensAndStartGame();
});
// --- ACCOUNT LOGIC END ---
// --- YENİ: TİCARET FONKSİYONLARI ---

/**
 * Ticaret daveti penceresini gösterir.
 */
function showTradeRequest(data) {
    currentTradeRequesterId = data.requesterId;
    tradeRequestMessage.textContent = `Oyuncu '${data.requesterName}' sizinle ticaret yapmak istiyor.`;
    tradeRequestPanel.classList.remove("hidden");
    
    // Diğer davetleri kapat
    closePartyInvite();
}

function closeTradeRequest() {
    currentTradeRequesterId = null;
    tradeRequestPanel.classList.add("hidden");
}

/**
 * Ana ticaret penceresini açar ve DOM dinleyicilerini ayarlar.
 */
function openTradeWindow(data) {
    currentTradeSession = data; // Sunucudan gelen ilk veriyi sakla
    
    // Davet penceresini kapat
    closeTradeRequest();
    
    // İsimleri ayarla
    myTradeName.textContent = players[mySocketId].name;
    opponentTradeName.textContent = data.opponent.name;
    
    // Arayüzü çiz
    renderTradeWindow();
    
    // Dinleyicileri (yeniden) ayarla
    tradeCancelBtn.onclick = closeTradeWindow;
    
    // Yang girişi
    myTradeYang.onchange = (e) => {
        let amount = parseInt(e.target.value) || 0;
        const myYang = players[mySocketId]?.yang || 0;
        if (amount > myYang) {
            amount = myYang;
            e.target.value = amount;
        }
        if (amount < 0) amount = 0;
        
        // Sadece miktar değiştiyse sunucuya haber ver
        if (currentTradeSession.myOffer.yang !== amount) {
            socket.emit("setTradeYang", {
                tradeId: currentTradeSession.tradeId,
                amount: amount
            });
        }
    };
    
    // Kabul/Onay butonu
    tradeAcceptBtn.onclick = () => {
        if (!currentTradeSession) return;
        
        const myLock = currentTradeSession.myId === currentTradeSession.playerA_id ? currentTradeSession.playerA_locked : currentTradeSession.playerB_locked;
        const opLock = currentTradeSession.myId === currentTradeSession.playerA_id ? currentTradeSession.playerB_locked : currentTradeSession.playerA_locked;

        // GÜNCEL MANTIK: İki aşamalı onay
        if (myLock && opLock) {
            // 2. Aşama: Her iki taraf da kilitliyse, son onayı gönder
            socket.emit("confirmTrade", { tradeId: currentTradeSession.tradeId });
            tradeAcceptBtn.disabled = true; // Sunucudan yanıt gelene kadar kilitle
        } else if (!myLock) {
            // 1. Aşama: Kilitli değilse, teklifi kilitle
            socket.emit("lockTrade", { tradeId: currentTradeSession.tradeId });
            tradeAcceptBtn.disabled = true; // Sunucudan yanıt gelene kadar kilitle
        }
    };

    // Pencereyi göster
    tradePanel.classList.remove("hidden");
}

function closeTradeUI() {
    // Oturumu sıfırla
    currentTradeSession = null;
    
    // Pencereyi gizle
    if (tradePanel) {
        tradePanel.classList.add("hidden"); 
    }
    
    // Diğer elementleri temizle
    if (tradeConfirmStatus) {
        tradeConfirmStatus.textContent = "";
    }
    if (tradeAcceptBtn) {
        tradeAcceptBtn.disabled = false; // Butonu yeniden aktifleştir
    }
    
    // Envanterdeki "in-trade" sınıfını temizle
    updateInventoryUI();
    
    // Yang alanını temizle/sıfırla
    if (myTradeYang) {
        myTradeYang.value = 0;
    }
    
    console.log("Ticaret UI temizlendi ve pencere gizlendi.");
}


/**
 * Ticaret penceresini kapatır ve oturumu sıfırlar.
 */
function closeTradeWindow() {
    if (currentTradeSession) {
        // Kullanıcı butona bastığı için sunucuya iptal ettiğimizi bildir
        // Sunucu bu sinyali aldıktan sonra "tradeCancelled" eventini geri gönderecektir.
        socket.emit("cancelTrade"); 
        
        // Bu yüzden burada closeTradeUI() çağırmaya gerek yok,
        // tradeCancelled eventinin gelmesini bekliyoruz.
        // Ancak bu satırları koyarsak daha hızlı kapanır:
        closeTradeUI(); // Hemen kapat, sunucudan onay gelince tekrar temizler/kapatır (fark etmez)
    } else {
        closeTradeUI(); // Zaten bir oturum yoksa yine de kapat
    }
}
/**
 * currentTradeSession verisine göre ticaret penceresini günceller.
 */
// client.js (renderTradeWindow fonksiyonunun tamamı)

function renderTradeWindow() {
    if (!currentTradeSession) return;
    
    const trade = currentTradeSession;
    const myId = trade.myId;
    
    // Rolleri Doğru Hesaplama
    const isPlayerA = trade.playerA_id === myId;
    const myLock = isPlayerA ? trade.playerA_locked : trade.playerB_locked;
    const opLock = isPlayerA ? trade.playerB_locked : trade.playerA_locked;
    
    // Onay Durumlarını Hesaplama
    const myConfirmed = isPlayerA ? trade.playerA_confirmed : trade.playerB_confirmed;
    const opConfirmed = isPlayerA ? trade.playerB_confirmed : trade.playerA_confirmed; 
    
    // 1. Kilit (Yeşil/Kırmızı Işık) Durumları
    myTradeStatus.classList.toggle("locked", myLock);
    opponentTradeStatus.classList.toggle("locked", opLock);
    
    // 2. Yang Alanları
    myTradeYang.value = trade.myOffer.yang;
    opponentTradeYang.value = trade.opponentOffer.yang;
    
    // Yang girişi: Eğer kilitliyse (onayladıysa) Yang'ı değiştiremez
    myTradeYang.disabled = myLock;
    
    // 3. Eşya Gridleri
    
    // Benim Grid'im (Sürükle-Bırak ve Tıklama)
    myTradeGrid.innerHTML = "";
    const myItems = trade.myOffer.items;
    for (let i = 0; i < 12; i++) {
        const itemOffer = myItems[i];
        const slot = document.createElement("div");
        slot.className = "trade-slot";
        slot.dataset.tradeIndex = i;
        
        if (itemOffer) {
            const item = itemOffer.item;
            let iconPath = '';
            if (item.iconSrc) {
                if (item.type === 'weapon') iconPath = `/assets/weapons/${item.iconSrc}`;
                else iconPath = `/assets/armors/${item.iconSrc}`;
            }
            slot.innerHTML = `<img src="${iconPath || getItemSVG(item.icon)}" alt="${item.name}">`;
            
            // Tıklayınca geri çekme (Eğer kilitli DEĞİLSE)
            if (!myLock) {
                slot.style.cursor = "pointer";
                slot.onclick = () => {
                    socket.emit("removeTradeItem", {
                        tradeId: trade.tradeId,
                        tradeSlotIndex: i
                    });
                };
            }
        } else {
            // Boş slot: Sürükle-Bırak hedefi (Eğer kilitli DEĞİLSE)
            if (!myLock) {
                slot.ondragover = allowDrop;
                slot.ondrop = handleTradeItemDrop;
            }
        }
        myTradeGrid.appendChild(slot);
    }
    
    // Karşı Tarafın Grid'i (Sadece Gösterim)
    opponentTradeGrid.innerHTML = "";
    const opItems = trade.opponentOffer.items;
     for (let i = 0; i < 12; i++) {
        const itemOffer = opItems[i];
        const slot = document.createElement("div");
        slot.className = "trade-slot";
        if (itemOffer) {
            const item = itemOffer.item;
            let iconPath = '';
            if (item.iconSrc) {
                if (item.type === 'weapon') iconPath = `/assets/weapons/${item.iconSrc}`;
                else iconPath = `/assets/armors/${item.iconSrc}`;
            }
            slot.innerHTML = `<img src="${iconPath || getItemSVG(item.icon)}" alt="${item.name}">`;
        }
        opponentTradeGrid.appendChild(slot);
    }
    
    // 4. Kabul/Onay Butonu Durumu
    tradeAcceptBtn.disabled = false; // <<< KRİTİK: Her zaman başlangıçta açılır
    tradeConfirmStatus.textContent = ""; 
    tradeAcceptBtn.style.background = ""; 

    if (myLock && opLock) {
        // Her iki taraf da kilitli: Final Onay Bekleniyor
        tradeAcceptBtn.textContent = "Ticareti Onayla";
        tradeAcceptBtn.style.background = "#004499"; 
        tradeAcceptBtn.disabled = myConfirmed; 
        
        if(myConfirmed) {
             tradeAcceptBtn.textContent = "Onaylandı, Bekleniyor";
             tradeAcceptBtn.style.background = "#555";
             tradeConfirmStatus.textContent = "Onaylandı. Karşı taraf bekleniyor...";
        }

    } else if (myLock) {
        // Ben kilitledim, karşı taraf bekleniyor
        tradeAcceptBtn.textContent = "Karşı Taraf Kabulü Bekleniyor...";
        tradeAcceptBtn.disabled = true;
    } else {
        // Ben kilitlemedim: İlk Kabul (opLock durumuna bakılmaksızın)
        // Eğer B kilitlediyse (opLock=true), A buraya düşmeli ve "Kabul Et"i görmeli.
        tradeAcceptBtn.textContent = "Kabul Et";
    }
    
    // 5. Envanter UI'ını güncelle
    updateInventoryUI();
}

/**
 * Envanterden ticaret penceresine eşya sürüklendiğinde çalışır.
 */
function handleTradeItemDrop(e) {
    e.preventDefault();
    if (!currentTradeSession) return;
    
    let data = null;
    try {
        const rawData = e.dataTransfer.getData("text/inventory");
        if (!rawData) return;
        data = JSON.parse(rawData);
    } catch (error) { return; }

    if (!data || data.type !== "inventory") return;

    const inventoryIndex = parseInt(data.index);
    const item = inventory[inventoryIndex];

    if (!item) return;
    
    // Tüketilebilir (pot vb.) ticareti engelle
    if (item.type === 'consumable') {
        showWarnPanel("Tüketilebilir eşyalar (pot vb.) ticarete konulamaz.");
        return;
    }

    // Sunucuya "bu item'ı ticarete ekle" isteği gönder
    socket.emit("addTradeItem", {
        tradeId: currentTradeSession.tradeId,
        inventoryIndex: inventoryIndex
    });
}

// --- TİCARET FONKSİYONLARI SONU ---
// --------------------------- SOCKET ---------------------------
socket.on("connect", () => {
  mySocketId = socket.id;
  console.log("Bağlandım:", mySocketId);
});

socket.on("gameState", (data) => {
  players = data.players;
  mobs = data.mobs;
  npcs = data.npcs;
  portals = data.portals || []; 

  // --- BU BLOK KOMPLE GÜNCELLENDİ (TİTREME ÇÖZÜMÜ) ---
  const me = players[mySocketId];
  if (me) {
    
    // 1. Sunucudan gelen yeni veriyi al
    const newInventory = me.inventory || Array(25).fill(null);
    const newEquipment = me.equipment || { 
        weapon: null, helmet: null, armor: null, shield: null,
        necklace: null, earring: null, bracelet: null, shoes: null
    };

    // 2. Veriyi karşılaştırma için metne dönüştür
    const newInventoryState = JSON.stringify(newInventory);
    const newEquipmentState = JSON.stringify(newEquipment);
    
    let needsUpdate = false; // Güncelleme gerekiyor mu?

    // 3. Envanter değişmiş mi diye kontrol et
    if (newInventoryState !== lastInventoryState) {
        inventory = newInventory; // Yerel envanteri güncelle
        lastInventoryState = newInventoryState; // Son durumu kaydet
        needsUpdate = true;
    }

    // 4. Ekipman değişmiş mi diye kontrol et
    if (newEquipmentState !== lastEquipmentState) {
        equipment = newEquipment; // Yerel ekipmanı güncelle
        lastEquipmentState = newEquipmentState; // Son durumu kaydet
        needsUpdate = true;
    }

    // 5. EĞER İKİSİNDEN BİRİ DEĞİŞTİYSE, UI'ı SADECE BİR KEZ güncelle
    if (needsUpdate) {
        updateInventoryUI();
    }
  }
  // --- GÜNCELLEME SONU ---
});


// --- YENİ: TİCARET SOCKET DİNLEYİCİLERİ ---

socket.on("tradeRequestReceived", (data) => {
    // data = { requesterId: '...', requesterName: '...' }
    showTradeRequest(data);
});

socket.on("tradeRequestDeclined", (data) => {
    // data = { message: '...' }
    showWarnPanel(data.message);
});

socket.on("tradeWindowOpen", (data) => {
    // data = { tradeId: ..., myId: ..., opponent: {...}, ... }
    openTradeWindow(data);
});

socket.on("tradeOfferUpdate", (data) => {
    // data = { myOffer: {...}, opponentOffer: {...} }
    if (currentTradeSession) {
        currentTradeSession.myOffer = data.myOffer;
        currentTradeSession.opponentOffer = data.opponentOffer;
        renderTradeWindow();
    }
});

socket.on("tradeSuccess", (data) => {
    // data = { message: "..." }
    
    // 1. Bildirimi göster
    showNotification({ title: "Ticaret Başarılı", message: data.message });
    
    // 2. KAPANMA MEKANİZMASI (Try-Catch ile kesinleştirme)
    try {
        currentTradeSession = null;
        // KRİTİK: Eğer tanımlıysa, gizle.
        if (tradePanel) tradePanel.classList.add("hidden"); 
        tradeConfirmStatus.textContent = "";
        
        // 3. Envanteri güncelle
        updateInventoryUI();
        lastInventoryState = "[]"; 
        lastEquipmentState = "{}";
        
    } catch(e) {
        console.error("tradeSuccess: Kapanma sırasında hata!", e);
        // Hata durumunda bile pencereyi kapatmaya zorla
        document.getElementById("tradePanel")?.classList.add("hidden");
    }
});

socket.on("tradeCancelled", (data) => {
    // data = { message: "..." }
    
    // 1. Bildirimi göster
    showNotification({ title: "Ticaret İptal", message: data.message });
    
    // 2. KAPANMA MEKANİZMASI (Try-Catch ile kesinleştirme)
     try {
        currentTradeSession = null;
        // KRİTİK: Eğer tanımlıysa, gizle.
        if (tradePanel) tradePanel.classList.add("hidden"); 
        tradeConfirmStatus.textContent = "";
        
        // 3. Envanteri güncelle
        updateInventoryUI();
        lastInventoryState = "[]";
        
    } catch(e) {
        console.error("tradeCancelled: Kapanma sırasında hata!", e);
        document.getElementById("tradePanel")?.classList.add("hidden");
    }
});



socket.on("itemToInventory", (item) => {
    const index = inventory.findIndex(slot => slot === null);
    if (index > -1) {
        inventory[index] = item;
    } else {
         console.log("Envanter dolu, çıkarılan eşya kayboldu!");
    }
    updateInventoryUI();
});

socket.on("itemSold", (data) => {
    if (data.inventoryIndex !== undefined && inventory[data.inventoryIndex]) {
        inventory[data.inventoryIndex] = null;
    }
    
    updateInventoryUI(); 
    updateSellPanelUI(); 
});

socket.on("itemEquipped", (data) => {
    if (data.inventoryIndex !== undefined && inventory[data.inventoryIndex]) {
        inventory[data.inventoryIndex] = null;

        if (data.oldItem) {
            inventory[data.inventoryIndex] = data.oldItem;
        }
    }
    
    updateInventoryUI();
});

socket.on("skillSetChosen", (data) => {
    const me = players[mySocketId];
    if (me) {
        me.skillSet = data.skillSet;
        me.skills = data.skills;
        me.skillPoints = data.skillPoints;
        
        updateSkillPanelUI(); 
    }
});

socket.on("playerSkillsUpdated", (data) => {
    const me = players[mySocketId];
    if (me) {
        me.skills = data.skills;
        me.skillPoints = data.skillPoints;
        
        updateSkillPanelUI();
    }
});

socket.on("consumableUsed", (data) => {
    const index = data.inventoryIndex;
    const item = inventory[index];
    
    if (item && item.type === 'consumable') {
        if (item.quantity > 1) {
            item.quantity--;
        } else {
            inventory[index] = null;
            
            actionBarSlots.forEach((slot, slotIndex) => {
                if(slot && slot.type === 'item' && slot.invIndex === index) {
                    actionBarSlots[slotIndex] = null;
                }
            });
        }
        updateInventoryUI();
        renderActionBar();
    }
});

socket.on("upgradeResult", (data) => {
    
    // Butonu tekrar kullanılabilir yap (Eğer +9 olmazsa updateBlacksmithUI tekrar ayarlar)
    upgradeButton.disabled = false;
    upgradeButton.textContent = "YÜKSELT";

    if (data.success) {
        // === BAŞARILI ===
        showNotification({ title: "Demirci", message: data.message });
        
        // 1. Client envanterini sunucudan gelen yeni item ile güncelle
        inventory[data.inventoryIndex] = data.item;
        
        // =================================================================
        // ### KRİTİK DÜZELTME: resetUpgradeSlot() SİLİNDİ ###
        // Demirci UI'ını temizlemek yerine, 
        // bir sonraki yükseltmeyi göstermesi için YENİ item (data.item) ile güncelle.
        updateBlacksmithUI(data.item, data.inventoryIndex);
        // =================================================================

        // 3. Envanter UI'ını güncelle
        updateInventoryUI();
        lastInventoryState = "[]"; // UI'ın güncellenmesini zorla
    
    } else {
        // === BAŞARISIZ ===
        if (data.isDestroyed) {
             // Item yok oldu
             showWarnPanel(data.message);
             
             // Client envanterinden sil
             inventory[data.inventoryIndex] = null;
             
             // Demirci UI'ını temizle (Başarısız olunca temizlenmesi doğru)
             resetUpgradeSlot();
             
             // Envanter UI'ını güncelle
             updateInventoryUI();
             lastInventoryState = "[]"; // Güncellenmeyi zorla

        } else {
             // Yetersiz yang, +9 vb.
             showWarnPanel(data.message);
             
             // Butonu tekrar aktifleştir (eğer item hala oradaysa)
             if(itemInUpgradeSlot) {
                 upgradeButton.disabled = false;
             }
        }
    }
});

socket.on("potUsedCooldown", (data) => {
    const duration = data.cooldown;
    globalPotCooldownEnd = Date.now() + duration;

    if (cooldownAnimationId === null) {
        cooldownAnimationId = requestAnimationFrame(updateCooldownVisuals);
    }
});

socket.on("newChatMessage", (data) => {
    // data = { type: 'general', sender: 'OyuncuAdi', message: 'Merhaba' }
    // veya { type: 'system', message: 'Sunucu yeniden başlıyor' }
    
    addMessageToChat(data);
});

socket.on("showNotification", (data) => {
    const panel = document.getElementById("notificationPanel");
    const titleEl = document.getElementById("notificationTitle");
    const messageEl = document.getElementById("notificationMessage");

    if (!panel || !titleEl || !messageEl) return;

    if (notificationTimer) {
        clearTimeout(notificationTimer);
    }

    titleEl.textContent = data.title;
    messageEl.textContent = data.message;

    panel.classList.add("show");
    panel.classList.remove("hidden");

    notificationTimer = setTimeout(() => {
        panel.classList.remove("show");
        setTimeout(() => panel.classList.add("hidden"), 500); 
    }, 5000); 
});

socket.on("skillUsed", (data) => {
    showCooldown(data.slotIndex, data.cooldown);
});

socket.on("skillError", (data) => {
    showWarnPanel(data.message);
});

socket.on("partyInviteReceived", (data) => {
    // data = { inviterId: '...', inviterName: '...' }
    showPartyInvite(data);
});

socket.on("partyDataUpdate", (data) => {
    // data = { id: '...', leader: '...', members: [...] } VEYA null
    myParty = data;

    updatePartyUI();
});

/**
 * Bir taraf teklifi kilitlediğinde (veya kilit açıldığında) tetiklenir.
 * "Kabul Et" butonunu "Ticareti Onayla"ya dönüştürmek için KRİTİKTİR.
 */
socket.on("tradeLockUpdate", (data) => {
    // data = { playerA_locked: bool, playerB_locked: bool }
    if (currentTradeSession) {
        currentTradeSession.playerA_locked = data.playerA_locked;
        currentTradeSession.playerB_locked = data.playerB_locked;
        
        // Kilitler açıldıysa (örn: biri teklifi değiştirdi),
        // "Onay bekliyor..." yazısını temizle
        if (!data.playerA_locked || !data.playerB_locked) {
            tradeConfirmStatus.textContent = "";
        }
        
        // KRİTİK EKLEME: renderTradeWindow çağrılmadan önce butonu zorla etkinleştir.
        // renderTradeWindow içindeki mantık, gerekiyorsa onu tekrar devre dışı bırakacaktır.
        tradeAcceptBtn.disabled = false; 

        // Arayüzü yeni kilit durumuna göre güncelle
        renderTradeWindow();
    }
});

socket.on("tradeConfirmUpdate", (data) => {
    // data = { message: "Karşı taraf son onayı verdi..." } VEYA { message: "Onaylandı. Karşı taraf bekleniyor..." }
    if (tradeConfirmStatus) {
        // Bu mesajı alt bilgi alanında göster
        tradeConfirmStatus.textContent = data.message; 
    }
    
    // Eğer karşı taraf onayladıysa, benim butonu açar ve UI'ı günceller
    if (data.message.includes("Karşı taraf son onayı verdi")) {
        tradeAcceptBtn.disabled = false;
        renderTradeWindow();
    }
});

/**
 * Bir taraf teklifi (item/yang) değiştirdiğinde tetiklenir.
 * Karşı tarafın ne koyduğunu görmek için KRİTİKTİR.
 */
