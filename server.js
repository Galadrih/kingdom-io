const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const fs = require('fs'); 
const path = require('path'); 
const { v4: uuidv4 } = require('uuid');

const mongoose = require('mongoose');
const { MongoClient, ServerApiVersion } = require('mongodb');

const MONGO_URI = "mongodb+srv://gameadmin:Ak387706@ashenrealms.dn8d9cx.mongodb.net/?appName=AshenRealms";

mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB Bağlantısı Başarılı.'))
  .catch(err => console.error('MongoDB Bağlantı Hatası:', err));

// YENİ: Şifreleri güvenli hale getirmek için kripto kütüphanesi ekle (npm install bcrypt)
// Eğer npm install bcrypt yapmadıysanız, aşağıdaki satırı şimdilik yorum satırı yapın ve sadece düz şifre kullanın.
// const bcrypt = require('bcrypt');
// const saltRounds = 10;

const ADMIN_ACCOUNTS = [
    "Galadrih",

];

// Eğer bcrypt kurmadıysanız, aşağıdaki basit (güvenli olmayan) şifre kontrolünü kullanın.
// **UYARI: Gerçek bir oyunda bcrypt kullanmak zorunludur!**
const hashPassword = (password) => password;
const comparePassword = (password, hash) => password === hash;
const playerToAccountMap = {}; // socket.id -> { username: '...', characterName: '...' }

const PLAYER_CLASSES = {
    warrior: {
        baseStats: { vit: 10, str: 10, int: 5, dex: 5 },
        name: "Savaşçı"
    },
    ninja: {
        baseStats: { vit: 5, str: 5, int: 5, dex: 15 },
        name: "Ninja"
    },
    sura: {
        baseStats: { vit: 8, str: 8, int: 10, dex: 4 },
        name: "Sura"
    },
    shaman: {
        baseStats: { vit: 5, str: 4, int: 15, dex: 6 },
        name: "Şaman"
    },
    lycan: {
        baseStats: { vit: 12, str: 12, int: 2, dex: 4 },
        name: "Lycan"
    }
};
// KRİTİK TAŞIMA SONU

const app = express();
const server = http.createServer(app);
const io = new socketIo.Server(server);


const PORT = 3000;

// Statik dosyalar
app.use(express.static(__dirname));
app.use("/assets", express.static(__dirname + "/assets"));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

let players = {};
let mobs = {};
let npcs = {};
let lastMobId = 0;
let parties = {};
let activeTrades = {};

let deadMetins = {}; // YENİ: Ölen metinleri ve ne zaman dirileceklerini tutar
const METIN_RESPAWN_TIME = 60000; // YENİ: 1 dakika (60 saniye) sonra dirilir

let accounts = {};

// 1. Oyuncu Envanter/Ekipman Alt Şemaları
const itemSchema = new mongoose.Schema({
    id: Number,
    name: String,
    type: String,
    iconSrc: String,
    dmg: Number,
    def: Number,
    hp: Number,
    mp: Number,
    speed: Number,
    plus: { type: Number, default: 0 },
    quantity: { type: Number, default: 1 },
    requiredLevel: Number,
    forClass: String,
    sellPrice: Number,
}, { _id: false });

// 2. Ana Oyuncu Şeması
const playerSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    kingdom: String,
    class: String,
    map: { type: String, default: "village" },
    x: { type: Number, default: 3200 },
    y: { type: Number, default: 2400 },
    direction: { type: String, default: "down" },
    
    level: { type: Number, default: 1 },
    exp: { type: Number, default: 0 },
    maxExp: { type: Number, default: 100 },
    hp: { type: Number, default: 100 },
    maxHp: { type: Number, default: 100 },
    mp: { type: Number, default: 50 },
    maxMp: { type: Number, default: 50 },
    yang: { type: Number, default: 5000 },
    
    stats: { 
        vit: { type: Number, default: 5 },
        str: { type: Number, default: 5 },
        int: { type: Number, default: 5 },
        dex: { type: Number, default: 5 }
    },
    statPoints: { type: Number, default: 0 },
    
    // Envanter (25 slot)
    inventory: [itemSchema], 
    
    // Ekipman
    equipment: { 
        weapon: itemSchema, helmet: itemSchema, armor: itemSchema, shield: itemSchema,
        necklace: itemSchema, earring: itemSchema, bracelet: itemSchema, shoes: itemSchema
    },

    // Beceriler
    skillSet: { type: String, default: null },
    skillPoints: { type: Number, default: 0 },
    skills: { type: Map, of: Number, default: {} }, // skillId: level
    activeBuffs: { type: Map, of: Number, default: {} },
    
    createdAt: { type: Date, default: Date.now }
});

const PlayerModel = mongoose.model('Player', playerSchema);

// 3. Hesap Şeması (Karakter listesi için)
const accountSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    characters: [String] // Sadece karakter isimlerini tutar
});

const AccountModel = mongoose.model('Account', accountSchema);

// ---------------------- EŞYA VERİTABANI ----------------------
// ---------------------- EŞYA VERİTABANI ----------------------
const ITEM_DB = {
  // --- Ortak Aksesuarlar ---
  101: { id: 101, name: "Gümüş Kolye", type: "necklace", icon: "Necklace", hp: 50, requiredLevel: 1, iconSrc: "accessory_necklace_1.png", sellPrice: 200 },
  102: { id: 102, name: "Zümrüt Küpe", type: "earring", icon: "Earring", mp: 30, requiredLevel: 1, iconSrc: "accessory_earring_1.png", sellPrice: 150 },
  103: { id: 103, name: "Güç Bileziği", type: "bracelet", icon: "Bracelet", dmg: 10, requiredLevel: 1, iconSrc: "accessory_bracelet_1.png", sellPrice: 250 },
  104: { id: 104, name: "Hız Ayakkabıları", type: "shoes", icon: "Boots", speed: 2, requiredLevel: 1, iconSrc: "accessory_shoes_1.png", sellPrice: 300 },
  105: { id: 105, name: "Küçük Kalkan", type: "shield", icon: "Shield", def: 3, requiredLevel: 1, iconSrc: "accessory_shield_1.png", sellPrice: 350 }, 
  
  // =========================================================================
  // --- YENİ/GÜNCELLENMİŞ TÜKETİM EŞYALARI (POTLAR) ---
  // Tekli potlar aynı zamanda envantere düşecek tekli itemlerdir.
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
  
  // Yığın (Stack) Versiyonları: Mağazadan satılmak için oluşturulmuş sanal itemlerdir.
  // Kırmızı Pot (K) Yığınları
  9101: { id: 9101, name: "Kırmızı Pot (K) x50", type: "consumable", requiredLevel: 1, stackSize: 50, restoreHp: 300, buyPrice: 100 * 50 * 0.95, sellPrice: 10, iconSrc: "red_elixir_1.png" }, // %5 indirimli
  9102: { id: 9102, name: "Kırmızı Pot (K) x100", type: "consumable", requiredLevel: 1, stackSize: 100, restoreHp: 300, buyPrice: 100 * 100 * 0.9, sellPrice: 10, iconSrc: "red_elixir_1.png" }, // %10 indirimli
  9103: { id: 9103, name: "Kırmızı Pot (K) x200", type: "consumable", requiredLevel: 1, stackSize: 200, restoreHp: 300, buyPrice: 100 * 200 * 0.85, sellPrice: 10, iconSrc: "red_elixir_1.png" }, // %15 indirimli

  // Mavi Pot (K) Yığınları
  9111: { id: 9111, name: "Mavi Pot (K) x50", type: "consumable", requiredLevel: 1, stackSize: 50, restoreMp: 100, buyPrice: 120 * 50 * 0.95, sellPrice: 12, iconSrc: "blue_elixir_1.png" },
  9112: { id: 9112, name: "Mavi Pot (K) x100", type: "consumable", requiredLevel: 1, stackSize: 100, restoreMp: 100, buyPrice: 120 * 100 * 0.9, sellPrice: 12, iconSrc: "blue_elixir_1.png" },
  9113: { id: 9113, name: "Mavi Pot (K) x200", type: "consumable", requiredLevel: 1, stackSize: 200, restoreMp: 100, buyPrice: 120 * 200 * 0.85, sellPrice: 12, iconSrc: "blue_elixir_1.png" },

  
  // =========================================================================
  // --- SAVAŞÇI EŞYALARI --- (Satış Fiyatları LvL'e göre artırıldı)
  // =========================================================================

  // Silahlar (Lv 1 - Lv 45)
  1001: { id: 1001, name: "Geniş Mızrak", type: "weapon", icon: "Sword", dmg: 20, forClass: "warrior", requiredLevel: 1, iconSrc: "warrior_weapon_1.png", sellPrice: 400 },
  1002: { id: 1002, name: "Mızrak", type: "weapon", icon: "Sword", dmg: 25, forClass: "warrior", requiredLevel: 5, iconSrc: "warrior_weapon_2.png", sellPrice: 600 },
  1003: { id: 1003, name: "Giyotin Pala", type: "weapon", icon: "Sword", dmg: 30, forClass: "warrior", requiredLevel: 10, iconSrc: "warrior_weapon_3.png", sellPrice: 900 },
  1004: { id: 1004, name: "Örümcek Mızrağı", type: "weapon", icon: "Sword", dmg: 35, forClass: "warrior", requiredLevel: 15, iconSrc: "warrior_weapon_4.png", sellPrice: 1200 },
  1005: { id: 1005, name: "Kargı", type: "weapon", icon: "Sword", dmg: 40, forClass: "warrior", requiredLevel: 20, iconSrc: "warrior_weapon_5.png", sellPrice: 1600 },
  1006: { id: 1006, name: "Savaş Tırpanı", type: "weapon", icon: "Sword", dmg: 45, forClass: "warrior", requiredLevel: 25, iconSrc: "warrior_weapon_6.png", sellPrice: 2100 },
  1007: { id: 1007, name: "Kırmızı Demir Pala", type: "weapon", icon: "Sword", dmg: 55, forClass: "warrior", requiredLevel: 30, iconSrc: "warrior_weapon_7.png", sellPrice: 2800 },
  1008: { id: 1008, name: "Baltalı Mızrak", type: "weapon", icon: "Sword", dmg: 60, forClass: "warrior", requiredLevel: 36, iconSrc: "warrior_weapon_8.png", sellPrice: 3500 },
  1009: { id: 1009, name: "Büyük Balta", type: "weapon", icon: "Sword", dmg: 70, forClass: "warrior", requiredLevel: 40, iconSrc: "warrior_weapon_9.png", sellPrice: 4200 },
  1010: { id: 1010, name: "Buzlu Uç", type: "weapon", icon: "Sword", dmg: 80, forClass: "warrior", requiredLevel: 45, iconSrc: "warrior_weapon_10.png", sellPrice: 5000 },

  // Zırhlar (Lv 1 - Lv 42)
  1101: { id: 1101, name: "Keşiş Plaka Zırh", type: "armor", icon: "Chestplate", def: 50, forClass: "warrior", requiredLevel: 1, iconSrc: "warrior_armor_1.png", sellPrice: 500 },
  1102: { id: 1102, name: "Demir Plaka Zırh", type: "armor", icon: "Chestplate", def: 60, forClass: "warrior", requiredLevel: 9, iconSrc: "warrior_armor_2.png", sellPrice: 800 },
  1103: { id: 1103, name: "Kaplan Plaka Zırh", type: "armor", icon: "Chestplate", def: 75, forClass: "warrior", requiredLevel: 18, iconSrc: "warrior_armor_3.png", sellPrice: 1300 },
  1104: { id: 1104, name: "Aslan Plaka Zırh", type: "armor", icon: "Chestplate", def: 90, forClass: "warrior", requiredLevel: 26, iconSrc: "warrior_armor_4.png", sellPrice: 2000 },
  1105: { id: 1105, name: "Ölümcül Plaka Zırh", type: "armor", icon: "Chestplate", def: 110, forClass: "warrior", requiredLevel: 34, iconSrc: "warrior_armor_5.png", sellPrice: 3000 },
  1106: { id: 1106, name: "Ejderha Plaka Zırh", type: "armor", icon: "Chestplate", def: 130, forClass: "warrior", requiredLevel: 42, iconSrc: "warrior_armor_6.png", sellPrice: 4500 },

  // Kasklar (Lv 1 - Lv 41)
  1201: { id: 1201, name: "Geleneksel Miğfer", type: "helmet", icon: "Helmet", def: 10, forClass: "warrior", requiredLevel: 1, iconSrc: "warrior_helmet_1.png", sellPrice: 300 },
  1202: { id: 1202, name: "Demir Kask", type: "helmet", icon: "Helmet", def: 20, forClass: "warrior", requiredLevel: 21, iconSrc: "warrior_helmet_2.png", sellPrice: 1500 },
  1203: { id: 1203, name: "Hayalet Maske Başlık", type: "helmet", icon: "Helmet", def: 35, forClass: "warrior", requiredLevel: 41, iconSrc: "warrior_helmet_3.png", sellPrice: 3800 },


  // =========================================================================
  // --- SURA EŞYALARI ---
  // =========================================================================
  
  // Silahlar (Lv 1 - Lv 45)
  2001: { id: 2001, name: "Kılıç", type: "weapon", icon: "Sword", dmg: 20, forClass: "sura", requiredLevel: 1, iconSrc: "sura_weapon_1.png", sellPrice: 400 },
  2002: { id: 2002, name: "Uzun Kılıç", type: "weapon", icon: "Sword", dmg: 25, forClass: "sura", requiredLevel: 5, iconSrc: "sura_weapon_2.png", sellPrice: 600 },
  2003: { id: 2003, name: "Hilal Kılıç", type: "weapon", icon: "Sword", dmg: 30, forClass: "sura", requiredLevel: 10, iconSrc: "sura_weapon_3.png", sellPrice: 900 },
  2004: { id: 2004, name: "Bambu Kılıcı", type: "weapon", icon: "Sword", dmg: 35, forClass: "sura", requiredLevel: 15, iconSrc: "sura_weapon_4.png", sellPrice: 1200 },
  2005: { id: 2005, name: "Geniş Kılıç", type: "weapon", icon: "Sword", dmg: 40, forClass: "sura", requiredLevel: 20, iconSrc: "sura_weapon_5.png", sellPrice: 1600 },
  2006: { id: 2006, name: "Gümüş Kılıç", type: "weapon", icon: "Sword", dmg: 45, forClass: "sura", requiredLevel: 25, iconSrc: "sura_weapon_6.png", sellPrice: 2100 },
  2007: { id: 2007, name: "Dolunay Kılıcı", type: "weapon", icon: "Sword", dmg: 55, forClass: "sura", requiredLevel: 30, iconSrc: "sura_weapon_7.png", sellPrice: 2800 },
  2008: { id: 2008, name: "Sahte Kılıç", type: "weapon", icon: "Sword", dmg: 60, forClass: "sura", requiredLevel: 36, iconSrc: "sura_weapon_8.png", sellPrice: 3500 },
  2009: { id: 2009, name: "Barbar Kılıcı", type: "weapon", icon: "Sword", dmg: 70, forClass: "sura", requiredLevel: 40, iconSrc: "sura_weapon_9.png", sellPrice: 4200 },
  2010: { id: 2010, name: "Kanlı Kılıç", type: "weapon", icon: "Sword", dmg: 80, forClass: "sura", requiredLevel: 45, iconSrc: "sura_weapon_10.png", sellPrice: 5000 },

  // Zırhlar (Lv 1 - Lv 42)
  2101: { id: 2101, name: "Ağıt Plaka Zırh", type: "armor", icon: "Chestplate", def: 45, forClass: "sura", requiredLevel: 1, iconSrc: "sura_armor_1.png", sellPrice: 500 },
  2102: { id: 2102, name: "Fırtına Plaka Zırh", type: "armor", icon: "Chestplate", def: 55, forClass: "sura", requiredLevel: 9, iconSrc: "sura_armor_2.png", sellPrice: 800 },
  2103: { id: 2103, name: "Kötü Şans Zırhı", type: "armor", icon: "Chestplate", def: 70, forClass: "sura", requiredLevel: 18, iconSrc: "sura_armor_3.png", sellPrice: 1300 },
  2104: { id: 2104, name: "Hayalet Plaka Zırh", type: "armor", icon: "Chestplate", def: 85, forClass: "sura", requiredLevel: 26, iconSrc: "sura_armor_4.png", sellPrice: 2000 },
  2105: { id: 2105, name: "Yin-Yang Zırh", type: "armor", icon: "Chestplate", def: 105, forClass: "sura", requiredLevel: 34, iconSrc: "sura_armor_5.png", sellPrice: 3000 },
  2106: { id: 2106, name: "Mistik Plaka Zırh", type: "armor", icon: "Chestplate", def: 125, forClass: "sura", requiredLevel: 42, iconSrc: "sura_armor_6.png", sellPrice: 4500 },

  // Kasklar (Lv 1 - Lv 41)
  2201: { id: 2201, name: "Kanlı Kask", type: "helmet", icon: "Helmet", def: 9, forClass: "sura", requiredLevel: 1, iconSrc: "sura_helmet_1.png", sellPrice: 300 },
  2202: { id: 2202, name: "Alaycı Kask", type: "helmet", icon: "Helmet", def: 19, forClass: "sura", requiredLevel: 21, iconSrc: "sura_helmet_2.png", sellPrice: 1500 },
  2203: { id: 2203, name: "Kale Kask", type: "helmet", icon: "Helmet", def: 34, forClass: "sura", requiredLevel: 41, iconSrc: "sura_helmet_3.png", sellPrice: 3800 },


  // =========================================================================
  // --- NİNJA EŞYALARI ---
  // =========================================================================

  // Silahlar (Lv 1 - Lv 45)
  3001: { id: 3001, name: "Hançer", type: "weapon", icon: "Sword", dmg: 20, forClass: "ninja", requiredLevel: 1, iconSrc: "ninja_weapon_1.png", sellPrice: 400 },
  3002: { id: 3002, name: "Amija", type: "weapon", icon: "Sword", dmg: 25, forClass: "ninja", requiredLevel: 5, iconSrc: "ninja_weapon_2.png", sellPrice: 600 },
  3003: { id: 3003, name: "Kobra Hançeri", type: "weapon", icon: "Sword", dmg: 30, forClass: "ninja", requiredLevel: 10, iconSrc: "ninja_weapon_3.png", sellPrice: 900 },
  3004: { id: 3004, name: "Dokuz Pala", type: "weapon", icon: "Sword", dmg: 35, forClass: "ninja", requiredLevel: 15, iconSrc: "ninja_weapon_4.png", sellPrice: 1200 },
  3005: { id: 3005, name: "Makas Hançer", type: "weapon", icon: "Sword", dmg: 40, forClass: "ninja", requiredLevel: 20, iconSrc: "ninja_weapon_5.png", sellPrice: 1600 },
  3006: { id: 3006, name: "Kısa Bıçak", type: "weapon", icon: "Sword", dmg: 45, forClass: "ninja", requiredLevel: 25, iconSrc: "ninja_weapon_6.png", sellPrice: 2100 },
  3007: { id: 3007, name: "Siyah Yaprak Hançeri", type: "weapon", icon: "Sword", dmg: 55, forClass: "ninja", requiredLevel: 30, iconSrc: "ninja_weapon_7.png", sellPrice: 2800 },
  3008: { id: 3008, name: "Kedi Isırığı Bıçak", type: "weapon", icon: "Sword", dmg: 60, forClass: "ninja", requiredLevel: 36, iconSrc: "ninja_weapon_8.png", sellPrice: 3500 },
  3009: { id: 3009, name: "Şeytan Surat Hançer", type: "weapon", icon: "Sword", dmg: 70, forClass: "ninja", requiredLevel: 40, iconSrc: "ninja_weapon_9.png", sellPrice: 4200 },
  3010: { id: 3010, name: "Şeytan Yumruğu Hançeri", type: "weapon", icon: "Sword", dmg: 80, forClass: "ninja", requiredLevel: 45, iconSrc: "ninja_weapon_10.png", sellPrice: 5000 },

  // Zırhlar (Lv 1 - Lv 42)
  3101: { id: 3101, name: "Gökmavisi Takım", type: "armor", icon: "Chestplate", def: 40, forClass: "ninja", requiredLevel: 1, iconSrc: "ninja_armor_1.png", sellPrice: 500 },
  3102: { id: 3102, name: "Fildişi Takım", type: "armor", icon: "Chestplate", def: 50, forClass: "ninja", requiredLevel: 9, iconSrc: "ninja_armor_2.png", sellPrice: 800 },
  3103: { id: 3103, name: "Koyu Kırmızı Takım", type: "armor", icon: "Chestplate", def: 65, forClass: "ninja", requiredLevel: 18, iconSrc: "ninja_armor_3.png", sellPrice: 1300 },
  3104: { id: 3104, name: "Kırmızı Karınca Takım", type: "armor", icon: "Chestplate", def: 80, forClass: "ninja", requiredLevel: 26, iconSrc: "ninja_armor_4.png", sellPrice: 2000 },
  3105: { id: 3105, name: "Karınca Aslan Takımı", type: "armor", icon: "Chestplate", def: 100, forClass: "ninja", requiredLevel: 34, iconSrc: "ninja_armor_5.png", sellPrice: 3000 },
  3106: { id: 3106, name: "Ninja Takımı", type: "armor", icon: "Chestplate", def: 120, forClass: "ninja", requiredLevel: 42, iconSrc: "ninja_armor_6.png", sellPrice: 4500 },

  // Kasklar (Lv 1 - Lv 41)
  3201: { id: 3201, name: "Deri Kapşon", type: "helmet", icon: "Helmet", def: 8, forClass: "ninja", requiredLevel: 1, iconSrc: "ninja_helmet_1.png", sellPrice: 300 },
  3202: { id: 3202, name: "Zincir Kapşon", type: "helmet", icon: "Helmet", def: 18, forClass: "ninja", requiredLevel: 21, iconSrc: "ninja_helmet_2.png", sellPrice: 1500 },
  3203: { id: 3203, name: "Çelik Kapşon", type: "helmet", icon: "Helmet", def: 33, forClass: "ninja", requiredLevel: 41, iconSrc: "ninja_helmet_3.png", sellPrice: 3800 },


  // =========================================================================
  // --- ŞAMAN EŞYALARI ---
  // =========================================================================

  // Silahlar (Lv 1 - Lv 45)
  4001: { id: 4001, name: "Yelpaze", type: "weapon", icon: "Sword", dmg: 18, forClass: "shaman", requiredLevel: 1, iconSrc: "shaman_weapon_1.png", sellPrice: 400 },
  4002: { id: 4002, name: "Demir Yaprak Yelpaze", type: "weapon", icon: "Sword", dmg: 23, forClass: "shaman", requiredLevel: 5, iconSrc: "shaman_weapon_2.png", sellPrice: 600 },
  4003: { id: 4003, name: "Siyah Kaplan Yelpaze", type: "weapon", icon: "Sword", dmg: 28, forClass: "shaman", requiredLevel: 10, iconSrc: "shaman_weapon_3.png", sellPrice: 900 },
  4004: { id: 4004, name: "Turna Kanadı Yelpaze", type: "weapon", icon: "Sword", dmg: 33, forClass: "shaman", requiredLevel: 15, iconSrc: "shaman_weapon_4.png", sellPrice: 1200 },
  4005: { id: 4005, name: "Tavuskuşu Yelpaze", type: "weapon", icon: "Sword", dmg: 38, forClass: "shaman", requiredLevel: 20, iconSrc: "shaman_weapon_5.png", sellPrice: 1600 },
  4006: { id: 4006, name: "Su Yelpazesi", type: "weapon", icon: "Sword", dmg: 43, forClass: "shaman", requiredLevel: 25, iconSrc: "shaman_weapon_6.png", sellPrice: 2100 },
  4007: { id: 4007, name: "Sonbahar Yelpazesi", type: "weapon", icon: "Sword", dmg: 53, forClass: "shaman", requiredLevel: 30, iconSrc: "shaman_weapon_7.png", sellPrice: 2800 },
  4008: { id: 4008, name: "Okyanus Yelpazesi", type: "weapon", icon: "Sword", dmg: 58, forClass: "shaman", requiredLevel: 36, iconSrc: "shaman_weapon_8.png", sellPrice: 3500 },
  4009: { id: 4009, name: "Azap Yelpazesi", type: "weapon", icon: "Sword", dmg: 68, forClass: "shaman", requiredLevel: 40, iconSrc: "shaman_weapon_9.png", sellPrice: 4200 },
  4010: { id: 4010, name: "Anka Kuşu Yelpaze", type: "weapon", icon: "Sword", dmg: 78, forClass: "shaman", requiredLevel: 45, iconSrc: "shaman_weapon_10.png", sellPrice: 5000 },

  // Zırhlar (Lv 1 - Lv 42)
  4101: { id: 4101, name: "Gökmavisi Elbise", type: "armor", icon: "Chestplate", def: 35, forClass: "shaman", requiredLevel: 1, iconSrc: "shaman_armor_1.png", sellPrice: 500 },
  4102: { id: 4102, name: "Turkuaz Elbise", type: "armor", icon: "Chestplate", def: 45, forClass: "shaman", requiredLevel: 9, iconSrc: "shaman_armor_2.png", sellPrice: 800 },
  4103: { id: 4103, name: "Pembe Elbise", type: "armor", icon: "Chestplate", def: 60, forClass: "shaman", requiredLevel: 18, iconSrc: "shaman_armor_3.png", sellPrice: 1300 },
  4104: { id: 4104, name: "Sevgi Elbisesi", type: "armor", icon: "Chestplate", def: 75, forClass: "shaman", requiredLevel: 26, iconSrc: "shaman_armor_4.png", sellPrice: 2000 },
  4105: { id: 4105, name: "Sema Elbisesi", type: "armor", icon: "Chestplate", def: 95, forClass: "shaman", requiredLevel: 34, iconSrc: "shaman_armor_5.png", sellPrice: 3000 },
  4106: { id: 4106, name: "Güneş Elbisesi", type: "armor", icon: "Chestplate", def: 115, forClass: "shaman", requiredLevel: 42, iconSrc: "shaman_armor_6.png", sellPrice: 4500 },

  // Kasklar (Lv 1 - Lv 41)
  4201: { id: 4201, name: "Keşiş Şapkası", type: "helmet", icon: "Helmet", def: 7, forClass: "shaman", requiredLevel: 1, iconSrc: "shaman_helmet_1.png", sellPrice: 300 },
  4202: { id: 4202, name: "Anka Şapkası", type: "helmet", icon: "Helmet", def: 17, forClass: "shaman", requiredLevel: 21, iconSrc: "shaman_helmet_2.png", sellPrice: 1500 },
  4203: { id: 4203, name: "Günışığı Şapka", type: "helmet", icon: "Helmet", def: 32, forClass: "shaman", requiredLevel: 41, iconSrc: "shaman_helmet_3.png", sellPrice: 3800 },


  // =========================================================================
  // --- LYCAN EŞYALARI ---
  // =========================================================================

  // Silahlar (Lv 1 - Lv 45)
  5001: { id: 5001, name: "Çelik Meşale", type: "weapon", icon: "Sword", dmg: 22, forClass: "lycan", requiredLevel: 1, iconSrc: "lycan_weapon_1.png", sellPrice: 400 },
  5002: { id: 5002, name: "Raptor", type: "weapon", icon: "Sword", dmg: 32, forClass: "lycan", requiredLevel: 10, iconSrc: "lycan_weapon_2.png", sellPrice: 900 },
  5003: { id: 5003, name: "Teşrihçi", type: "weapon", icon: "Sword", dmg: 42, forClass: "lycan", requiredLevel: 20, iconSrc: "lycan_weapon_3.png", sellPrice: 1600 },
  5004: { id: 5004, name: "Anka Kuşu Şişi", type: "weapon", icon: "Sword", dmg: 52, forClass: "lycan", requiredLevel: 30, iconSrc: "lycan_weapon_4.png", sellPrice: 2800 },
  5005: { id: 5005, name: "Kader Pençesi", type: "weapon", icon: "Sword", dmg: 62, forClass: "lycan", requiredLevel: 40, iconSrc: "lycan_weapon_5.png", sellPrice: 4200 },
  5006: { id: 5006, name: "Demir Pençe", type: "weapon", icon: "Sword", dmg: 72, forClass: "lycan", requiredLevel: 45, iconSrc: "lycan_weapon_6.png", sellPrice: 5000 },

  // Zırhlar (Lv 1 - Lv 42)
  5101: { id: 5101, name: "Gökrüzgarı Zırhı", type: "armor", icon: "Chestplate", def: 55, forClass: "lycan", requiredLevel: 1, iconSrc: "lycan_armor_1.png", sellPrice: 500 },
  5104: { id: 5104, name: "Bora Plaka Zırhı", type: "armor", icon: "Chestplate", def: 95, forClass: "lycan", requiredLevel: 26, iconSrc: "lycan_armor_4.png", sellPrice: 2000 }, 
  5105: { id: 5105, name: "Malahit Plaka Zırhı", type: "armor", icon: "Chestplate", def: 115, forClass: "lycan", requiredLevel: 34, iconSrc: "lycan_armor_5.png", sellPrice: 3000 },
  5106: { id: 5106, name: "Kasırga Plaka Zırhı", type: "armor", icon: "Chestplate", def: 135, forClass: "lycan", requiredLevel: 42, iconSrc: "lycan_armor_6.png", sellPrice: 4500 },

  // Kasklar (Lv 1 - Lv 41)
  5201: { id: 5201, name: "İskelet Miğfer", type: "helmet", icon: "Helmet", def: 11, forClass: "lycan", requiredLevel: 1, iconSrc: "lycan_helmet_1.png", sellPrice: 300 },
  5202: { id: 5202, name: "Karaörtü Miğferi", type: "helmet", icon: "Helmet", def: 21, forClass: "lycan", requiredLevel: 21, iconSrc: "lycan_helmet_2.png", sellPrice: 1500 },
  5203: { id: 5203, name: "Şimşek Miğferi", type: "helmet", icon: "Helmet", def: 36, forClass: "lycan", requiredLevel: 41, iconSrc: "lycan_helmet_3.png", sellPrice: 3800 },
};

const UPGRADE_DATA = {
    // [current_plus_level]: { cost: <yang>, successRate: <0-1>, weaponDmg: <bonus>, armorDef: <bonus> }
    // Not: successRate = 1.0 (%100), 0.2 (%20)
    0: { cost: 5000,    successRate: 1.00, weaponDmg: 3, armorDef: 2 }, // +0 -> +1
    1: { cost: 10000,   successRate: 0.90, weaponDmg: 3, armorDef: 2 }, // +1 -> +2
    2: { cost: 25000,   successRate: 0.80, weaponDmg: 3, armorDef: 2 }, // +2 -> +3
    3: { cost: 50000,   successRate: 0.70, weaponDmg: 4, armorDef: 3 }, // +3 -> +4
    4: { cost: 100000,  successRate: 0.60, weaponDmg: 4, armorDef: 3 }, // +4 -> +5
    5: { cost: 250000,  successRate: 0.50, weaponDmg: 4, armorDef: 3 }, // +5 -> +6
    6: { cost: 500000,  successRate: 0.40, weaponDmg: 5, armorDef: 5 }, // +6 -> +7
    7: { cost: 1000000, successRate: 0.30, weaponDmg: 5, armorDef: 5 }, // +7 -> +8
    8: { cost: 2500000, successRate: 0.20, weaponDmg: 6, armorDef: 6 }  // +8 -> +9
};

// ---------------------- NPC MAĞAZA VERİTABANI ----------------------
const SHOP_DB = {
    "v_merchant": [ // Satıcı NPC'sinin ID'si
        // Kırmızı Pot (K) Yığınları
        { itemId: 9001, stackable: true, maxStack: 99 }, // Tekli Satışa Açık Pot (Envantere düşmesi gerektiği için)
        { itemId: 9101, stackable: true, maxStack: 1 }, // x50 yığın
        { itemId: 9102, stackable: true, maxStack: 1 }, // x100 yığın
        { itemId: 9103, stackable: true, maxStack: 1 }, // x200 yığın
        
        // Mavi Pot (K) Yığınları
        { itemId: 9011, stackable: true, maxStack: 99 }, // Tekli Satışa Açık Pot
        { itemId: 9111, stackable: true, maxStack: 1 }, // x50 yığın
        { itemId: 9112, stackable: true, maxStack: 1 }, // x100 yığın
        { itemId: 9113, stackable: true, maxStack: 1 }, // x200 yığın
        
        // Ortak Eşya
        { itemId: 105, stackable: false, maxStack: 1 }, // Küçük Kalkan
    ]
};

const POT_COOLDOWN_MS = 1000; // 1 saniye bekleme süresi


const METIN_TYPES = [
    // --- BAŞLANGIÇ KÖY METİNLERİ (Lv 1 - 15) ---
    { 
        type: "Metin of Fight", color: "#B80000", baseHp: 500, size: 80, 
        levelRange: [5, 10], exp: 100, dropRate: 0.9,
        // İçinden çıkacak moblar (Seviye 1-10 aralığında)
        mobTypes: ["Wolf", "Pig", "Boar", "Snake"], 
        mobLevelRange: [1, 10], 
        mobCount: [3, 5], // Tek seferde çıkacak canavar sayısı
        spawnCount: 3,    // Toplamda kaç kez canavar çıkaracağı
        asset: "metin_fight" 
    },
    { 
        type: "Metin of Black", color: "#222222", baseHp: 800, size: 90, 
        levelRange: [10, 15], exp: 200, dropRate: 1.0, 
        mobTypes: ["Wolf", "Boar", "Alpha Wolf"], 
        mobLevelRange: [5, 15], 
        mobCount: [5, 7], 
        spawnCount: 4,    
        asset: "metin_black" 
    },
    
    // --- ORMAN METİNLERİ (Lv 21 - 40) ---
    { 
        type: "Metin of Jealousy", color: "#006400", baseHp: 1500, size: 100, 
        levelRange: [25, 30], exp: 500, dropRate: 1.0, 
        mobTypes: ["Orc", "Demon", "Spirit", "Forest Spider"], 
        mobLevelRange: [20, 30], 
        mobCount: [7, 9], 
        spawnCount: 5,    
        asset: "metin_jealousy" 
    },
    { 
        type: "Metin of Soul", color: "#FFD700", baseHp: 2000, size: 110, 
        levelRange: [35, 40], exp: 800, dropRate: 1.0, 
        mobTypes: ["Demon", "Spirit", "Golem", "Giant Spider"], 
        mobLevelRange: [30, 40], 
        mobCount: [9, 11], 
        spawnCount: 6,    
        asset: "metin_soul" 
    },
    
    // Yüksek seviye metinler (ileride eklenebilir)
    // ...
];

// ---------------------- MOB VERİTABANI ----------------------
const MOB_TYPES = [
  // levelRange: [1, 5] (Düşük Seviye/Başlangıç Köy İtemleri)
  { type: "Wolf", color: "#777", baseHp: 40, dmg: 5, size: 30, levelRange: [1, 5], exp: 15, dropRate: 0.3, 
    // DROPS: Başlangıç silahları (Lv 1, Lv 5), Lv 1 Zırh/Kask ve Ortak Aksesuarlar
    drops: [
      1001, 2001, 3001, 4001, 5001, // Lv 1 Silahlar (Her sınıftan)
      1002, 2002, 3002, 4002,      // Lv 5 Silahlar
      1101, 2101, 3101, 4101, 5101, // Lv 1 Zırhlar
      1201, 2201, 3201, 4201, 5201, // Lv 1 Kasklar
      101, 102, 103, 104, 105       // Ortak Aksesuarlar
    ], 
    isAggressive: false, moveSpeed: 4.5, aggroRange: 200, attackRange: 40, attackSpeed: 1000,
    // GÖRSEL TANIMLAR
    asset: "wolf", 
    idleSpeed: 25 
  },

  // --- KÖY CANAVARLARI (Village) ---
  { type: "Pig", color: "#E6A4B4", baseHp: 30, dmg: 3, size: 25, levelRange: [1, 3], exp: 10, dropRate: 0.2, 
    drops: [9001, 9011], // Sadece pot
    isAggressive: false, moveSpeed: 4, aggroRange: 150, attackRange: 30, attackSpeed: 1200,
    asset: "pig", 
    idleSpeed: 30 
  },
  { type: "Boar", color: "#773e00", baseHp: 50, dmg: 6, size: 35, levelRange: [2, 4], exp: 12, dropRate: 0.2, 
    drops: [1001, 2001, 3001, 4001, 5001], // Sadece Lv 1 silahlar
    isAggressive: false, moveSpeed: 4.2, aggroRange: 180, attackRange: 40, attackSpeed: 1100,
    asset: "boar", 
    idleSpeed: 28 
  },
  { type: "Alpha Wolf", color: "#999", baseHp: 70, dmg: 8, size: 35, levelRange: [5, 8], exp: 20, dropRate: 0.3, 
    drops: [1002, 2002, 3002, 4002, 101, 102, 103, 104, 105], // Lv 5 silahlar ve aksesuarlar
    isAggressive: true, moveSpeed: 4.8, aggroRange: 220, attackRange: 40, attackSpeed: 900,
    asset: "alphaWolf", 
    idleSpeed: 20 
  },
  { type: "Dire Wolf", color: "#555", baseHp: 100, dmg: 11, size: 40, levelRange: [8, 12], exp: 30, dropRate: 0.4, 
    drops: [1003, 2003, 3003, 4003, 5002, 1102, 2102, 3102, 4102], // Lv 10 silah, Lv 9 zırh
    isAggressive: true, moveSpeed: 4.6, aggroRange: 230, attackRange: 45, attackSpeed: 1000,
    asset: "direWolf", 
    idleSpeed: 22 
  },
  { type: "Shadow Wolf", color: "#222", baseHp: 120, dmg: 14, size: 35, levelRange: [12, 16], exp: 50, dropRate: 0.5, 
    drops: [1004, 2004, 3004, 4004], // Lv 15 silahlar
    isAggressive: true, moveSpeed: 5.0, aggroRange: 250, attackRange: 40, attackSpeed: 800,
    asset: "shadowWolf", 
    idleSpeed: 18 
  },
  { type: "Rabid Wolf", color: "#b30000", baseHp: 140, dmg: 18, size: 40, levelRange: [15, 18], exp: 65, dropRate: 0.5, 
    drops: [1004, 2004, 3004, 4004], // Lv 15 silahlar
    isAggressive: true, moveSpeed: 5.2, aggroRange: 280, attackRange: 40, attackSpeed: 700,
    asset: "rabidWolf", 
    idleSpeed: 15 
  },
  { type: "Ancient Wolf", color: "#DDD", baseHp: 160, dmg: 22, size: 45, levelRange: [18, 20], exp: 80, dropRate: 0.6, 
    drops: [1103, 2103, 3103, 4103, 1005, 2005, 3005, 4005, 5003], // Lv 18 zırh, Lv 20 silah
    isAggressive: true, moveSpeed: 4.5, aggroRange: 250, attackRange: 50, attackSpeed: 1000,
    asset: "ancientWolf", 
    idleSpeed: 20 
  },

  // --- ORMAN CANAVARLARI (Forest) ---
  { type: "Forest Spider", color: "#006400", baseHp: 180, dmg: 24, size: 40, levelRange: [21, 25], exp: 100, dropRate: 0.7, 
    drops: [1202, 2202, 3202, 4202, 5202], // Lv 21 kasklar
    isAggressive: false, moveSpeed: 4.5, aggroRange: 200, attackRange: 50, attackSpeed: 900,
    asset: "spider", 
    idleSpeed: 20 
  },
  { type: "Giant Spider", color: "#383838", baseHp: 220, dmg: 28, size: 60, levelRange: [26, 30], exp: 130, dropRate: 0.7, 
    drops: [1104, 2104, 3104, 4104, 5104, 1006, 2006, 3006, 4006], // Lv 26 zırh, Lv 25 silah
    isAggressive: true, moveSpeed: 4.2, aggroRange: 250, attackRange: 70, attackSpeed: 1300,
    asset: "giantSpider", 
    idleSpeed: 25 
  },
  { type: "Venom Spider", color: "#800080", baseHp: 280, dmg: 32, size: 45, levelRange: [31, 35], exp: 180, dropRate: 0.8, 
    drops: [1007, 2007, 3007, 4007, 5004], // Lv 30 silahlar
    isAggressive: true, moveSpeed: 4.8, aggroRange: 280, attackRange: 50, attackSpeed: 800,
    asset: "spider", 
    idleSpeed: 18 
  },
  { type: "Tarantula", color: "#8B4513", baseHp: 350, dmg: 40, size: 65, levelRange: [36, 40], exp: 220, dropRate: 0.8, 
    drops: [1105, 2105, 3105, 4105, 5105, 1008, 2008, 3008, 4008], // Lv 34 zırh, Lv 36 silah
    isAggressive: true, moveSpeed: 4.3, aggroRange: 260, attackRange: 75, attackSpeed: 1200,
    asset: "giantSpider", 
    idleSpeed: 24 
  },

  // --- ÇÖL CANAVARLARI (Desert) ---
  { type: "Sand Spider", color: "#F0E68C", baseHp: 400, dmg: 45, size: 40, levelRange: [41, 45], exp: 300, dropRate: 0.7, 
    drops: [1009, 2009, 3009, 4009, 5005], // Lv 40 silahlar
    isAggressive: false, moveSpeed: 4.7, aggroRange: 200, attackRange: 50, attackSpeed: 900,
    asset: "spider", 
    idleSpeed: 20 
  },
  { type: "Scorpion Spider", color: "#DAA520", baseHp: 480, dmg: 55, size: 50, levelRange: [46, 50], exp: 380, dropRate: 0.7, 
    drops: [1203, 2203, 3203, 4203, 5203], // Lv 41 kasklar
    isAggressive: true, moveSpeed: 5.0, aggroRange: 300, attackRange: 55, attackSpeed: 800,
    asset: "spider", 
    idleSpeed: 18 
  },
  { type: "Dune Lurker", color: "#C2B280", baseHp: 550, dmg: 60, size: 45, levelRange: [51, 55], exp: 450, dropRate: 0.6, 
    drops: [1106, 2106, 3106, 4106, 5106], // Lv 42 zırhlar
    isAggressive: true, moveSpeed: 5.2, aggroRange: 320, attackRange: 50, attackSpeed: 700,
    asset: "spider", 
    idleSpeed: 16 
  },
  { type: "Redback Spider", color: "#FF0000", baseHp: 620, dmg: 70, size: 50, levelRange: [56, 60], exp: 520, dropRate: 0.6, 
    drops: [1010, 2010, 3010, 4010, 5006], // Lv 45 silahlar
    isAggressive: true, moveSpeed: 5.0, aggroRange: 300, attackRange: 55, attackSpeed: 800,
    asset: "spider", 
    idleSpeed: 18 
  },
  { type: "Spider Queen", color: "#4B0082", baseHp: 800, dmg: 80, size: 70, levelRange: [58, 60], exp: 700, dropRate: 0.9, 
    drops: [1010, 2010, 3010, 4010, 5006], // Lv 45 silahlar
    isAggressive: true, moveSpeed: 4.5, aggroRange: 350, attackRange: 80, attackSpeed: 1100,
    asset: "giantSpider", 
    idleSpeed: 22 
  },
    
  // levelRange: [3, 10]
  { type: "Snake", color: "#ADFF2F", baseHp: 60, dmg: 7, size: 35, levelRange: [3, 10], exp: 25, dropRate: 0.4, 
    // DROPS: Lv 9 Zırh ve Lv 10 Silahlar
    drops: [
      1003, 2003, 3003, 4003, 5002, // Lv 10 Silahlar
      1102, 2102, 3102, 4102        // Lv 9 Zırhlar
    ], 
    isAggressive: false, moveSpeed: 4, aggroRange: 200, attackRange: 50, attackSpeed: 1000,
    // GÖRSEL TANIMLAR
    asset: "snake", 
    idleSpeed: 30
  },
    
  // levelRange: [6, 15]
  { type: "Orc", color: "#228B22", baseHp: 90, dmg: 10, size: 40, levelRange: [6, 15], exp: 40, dropRate: 0.5, 
    // DROPS: Lv 15 Silahlar
    drops: [
      1004, 2004, 3004, 4004, // Lv 15 Silahlar
    ], 
    isAggressive: true, moveSpeed: 4, aggroRange: 250, attackRange: 60, attackSpeed: 1200,
    // GÖRSEL TANIMLAR (KESİNLEŞTİRİLMİŞ)
    asset: "orc", 
    idleSpeed: 20
  },
  
  // levelRange: [16, 20]
  { type: "Demon", color: "#b30000", baseHp: 150, dmg: 20, size: 50, levelRange: [16, 20], exp: 80, dropRate: 0.6, 
    // DROPS: Lv 18 Zırh, Lv 20 Silah ve Lv 21 Kasklar
    drops: [
      1103, 2103, 3103, 4103, // Lv 18 Zırhlar
      1005, 2005, 3005, 4005, 5003, // Lv 20 Silahlar
      1202, 2202, 3202, 4202, 5202  // Lv 21 Kasklar
    ],
    isAggressive: true, moveSpeed: 4.2, aggroRange: 300, attackRange: 60, attackSpeed: 1000,
    // GÖRSEL TANIMLAR
    asset: "demon", 
    idleSpeed: 15
  },
    
  // levelRange: [21, 30] (Orman)
  { type: "Spirit", color: "#00CED1", baseHp: 200, dmg: 25, size: 50, levelRange: [21, 30], exp: 120, dropRate: 0.7, 
    // DROPS: Lv 25/26 Silah ve Zırhlar
    drops: [
      1104, 2104, 3104, 4104, 5104, // Lv 26 Zırhlar
      1006, 2006, 3006, 4006, // Lv 25 Silahlar
    ],
    isAggressive: false, moveSpeed: 4, aggroRange: 200, attackRange: 50, attackSpeed: 1000,
    // GÖRSEL TANIMLAR
    asset: "spirit", 
    idleSpeed: 25
  },
    
  // levelRange: [31, 40] (Orman)
  { type: "Golem", color: "#8B4513", baseHp: 300, dmg: 35, size: 70, levelRange: [31, 40], exp: 200, dropRate: 0.8, 
    // DROPS: Lv 30/34/36 Silah ve Zırhlar
    drops: [
      1007, 2007, 3007, 4007, 5004, // Lv 30 Silahlar
      1105, 2105, 3105, 4105, 5105, // Lv 34 Zırhlar
      1008, 2008, 3008, 4008, // Lv 36 Silahlar
    ],
    isAggressive: false, moveSpeed: 3, aggroRange: 200, attackRange: 80, attackSpeed: 1500,
    // GÖRSEL TANIMLAR
    asset: "golem", 
    idleSpeed: 40
  },

  // levelRange: [41, 50] (Çöl)
  { type: "Scorpion", color: "#DAA520", baseHp: 450, dmg: 50, size: 45, levelRange: [41, 50], exp: 350, dropRate: 0.7, 
    // DROPS: Lv 40/41 Silah ve Kasklar
    drops: [
      1009, 2009, 3009, 4009, 5005, // Lv 40 Silahlar
      1203, 2203, 3203, 4203, 5203, // Lv 41 Kasklar
    ],
    isAggressive: true, moveSpeed: 5, aggroRange: 300, attackRange: 50, attackSpeed: 800,
    // GÖRSEL TANIMLAR
    asset: "scorpion", 
    idleSpeed: 15
  }, 
    
  // levelRange: [51, 60] (Çöl)
  { type: "DesertSnake", color: "#8B4513", baseHp: 600, dmg: 65, size: 55, levelRange: [51, 60], exp: 500, dropRate: 0.6, 
    // DROPS: Lv 42/45 Silah ve Zırhlar
    drops: [
      1106, 2106, 3106, 4106, 5106, // Lv 42 Zırhlar
      1010, 2010, 3010, 4010, 5006, // Lv 45 Silahlar
    ],
    isAggressive: true, moveSpeed: 4, aggroRange: 250, attackRange: 60, attackSpeed: 1000,
    // GÖRSEL TANIMLAR
    asset: "desertSnake", 
    idleSpeed: 20
  },

  // levelRange: [61, 70] (Buzul)
  { type: "IceGolem", color: "#ADD8E6", baseHp: 900, dmg: 80, size: 75, levelRange: [61, 70], exp: 800, dropRate: 0.7, 
    // Droplar yüksek seviye itemlerden düşecek (şimdilik 45 lv son itemler)
    drops: [1010, 2010, 3010, 4010, 5006],
    isAggressive: false, moveSpeed: 3, aggroRange: 200, attackRange: 80, attackSpeed: 1500,
    // GÖRSEL TANIMLAR
    asset: "iceGolem", 
    idleSpeed: 40
  }, 
    
  // levelRange: [71, 80] (Buzul)
  { type: "Yeti", color: "#F5F5F5", baseHp: 1200, dmg: 100, size: 80, levelRange: [71, 80], exp: 1100, dropRate: 0.8, 
    // Droplar yüksek seviye itemlerden düşecek (şimdilik 45 lv son itemler)
    drops: [1010, 2010, 3010, 4010, 5006],
    isAggressive: true, moveSpeed: 4, aggroRange: 350, attackRange: 70, attackSpeed: 1300,
    // GÖRSEL TANIMLAR
    asset: "yeti", 
    idleSpeed: 15
  } 
];


// server.js (yaklaşık 80. satır)
// ESKİ SKILL_DB'Yİ SİLİN ve BU YENİSİNİ YAPIŞTIRIN

// ---------------------- BECERİ VERİTABANI (SKILL_DB) ----------------------
// type: "active" (anlık hasar), "buff" (durum güçlendirme)
// damageMultiplier: (player.baseDmg + player.bonusDmg + skillLevelDmg) * damageMultiplier
// mpCost: Becerinin harcadığı mana
// cooldown: Bekleme süresi (milisaniye cinsinden)
const SKILL_DB = {
  // --- SAVAŞÇI ---
  warrior: {
    body: { // Bedensel
      1: { id: "warrior_1_1", name: "Üç Yönlü Kesme", type: "active", mpCost: 20, cooldown: 5000, damageMultiplier: 1.5 },
      2: { id: "warrior_1_2", name: "Hava Kılıcı", type: "buff", mpCost: 30, cooldown: 60000, duration: 20000 }, // 20sn sürer, 60sn cooldown
      3: { id: "warrior_1_3", name: "Kılıç Çevirme", type: "active", mpCost: 40, cooldown: 12000, damageMultiplier: 1.8 }, // Alan hasarı
      4: { id: "warrior_1_4", name: "Öfke", type: "buff", mpCost: 50, cooldown: 30000, duration: 15000 }, // 15sn sürer, 30sn cooldown
      5: { id: "warrior_1_5", name: "Hamle", type: "active", mpCost: 25, cooldown: 10000, damageMultiplier: 1.2 }
    },
    mental: { // Zihinsel
      1: { id: "warrior_2_1", name: "Güçlü Beden", type: "buff", mpCost: 60, cooldown: 30000, duration: 20000 },
      2: { id: "warrior_2_2", name: "Ruh Vuruşu", type: "active", mpCost: 30, cooldown: 7000, damageMultiplier: 2.5 },
      3: { id: "warrior_2_3", name: "Şiddetli Vuruş", type: "active", mpCost: 40, cooldown: 10000, damageMultiplier: 2.2 },
      4: { id: "warrior_2_4", name: "Kılıç Darbesi", type: "active", mpCost: 25, cooldown: 15000, damageMultiplier: 1.0 }, // Sersemletme
      5: { id: "warrior_2_5", name: "Güçlü Vuruş", type: "active", mpCost: 20, cooldown: 6000, damageMultiplier: 1.8 }
    }
  },
  // --- NINJA ---
  ninja: {
    assassin: {
      1: { id: "ninja_1_1", name: "Suikast", type: "active", mpCost: 30, cooldown: 8000, damageMultiplier: 3.0 },
      2: { id: "ninja_1_2", name: "Hızlı Saldırı", type: "active", mpCost: 40, cooldown: 12000, damageMultiplier: 1.5 },
      3: { id: "ninja_1_3", name: "Bıçak Çevirme", type: "active", mpCost: 35, cooldown: 10000, damageMultiplier: 1.7 },
      4: { id: "ninja_1_4", name: "Zehirli Bulut", type: "active", mpCost: 50, cooldown: 20000, damageMultiplier: 0.5 }, // Zehir
      5: { id: "ninja_1_5", name: "Kamuflaj", type: "buff", mpCost: 60, cooldown: 40000, duration: 15000 }
    },
    archer: {
      1: { id: "ninja_2_1", name: "Ateşli Ok", type: "active", mpCost: 20, cooldown: 5000, damageMultiplier: 1.8 },
      2: { id: "ninja_2_2", name: "Zehirli Ok", type: "active", mpCost: 25, cooldown: 10000, damageMultiplier: 1.2 }, // Zehir
      3: { id: "ninja_2_3", name: "Ok Yağmuru", type: "active", mpCost: 50, cooldown: 15000, damageMultiplier: 2.0 }, // Alan
      4: { id: "ninja_2_4", name: "Tekrarlanan Atış", type: "active", mpCost: 35, cooldown: 8000, damageMultiplier: 2.2 },
      5: { id: "ninja_2_5", name: "Hafif Adım", type: "buff", mpCost: 40, cooldown: 30000, duration: 20000 }
    }
  },
  // --- SURA ---
  sura: {
    weaponry: {
      1: { id: "sura_1_1", name: "Büyülü Keskinlik", type: "buff", mpCost: 50, cooldown: 30000, duration: 20000 },
      2: { id: "sura_1_2", name: "Büyülü Zırh", type: "buff", mpCost: 50, cooldown: 30000, duration: 20000 },
      3: { id: "sura_1_3", name: "Dehşet", type: "buff", mpCost: 40, cooldown: 25000, duration: 15000 }, // Debuff
      4: { id: "sura_1_4", name: "Parmak Darbesi", type: "active", mpCost: 30, cooldown: 6000, damageMultiplier: 1.9 },
      5: { id: "sura_1_5", name: "Ejderha Dönüşü", type: "active", mpCost: 45, cooldown: 12000, damageMultiplier: 2.1 }
    },
    black_magic: {
      1: { id: "sura_2_1", name: "Karanlık Koruma", type: "buff", mpCost: 60, cooldown: 30000, duration: 20000 },
      2: { id: "sura_2_2", name: "Ateş Hayaleti", type: "active", mpCost: 30, cooldown: 8000, damageMultiplier: 2.0 },
      3: { id: "sura_2_3", name: "Karanlık Küre", type: "active", mpCost: 40, cooldown: 10000, damageMultiplier: 2.4 },
      4: { id: "sura_2_4", name: "Hayalet Vuruş", type: "active", mpCost: 25, cooldown: 7000, damageMultiplier: 1.8 },
      5: { id: "sura_2_5", name: "Karanlık Vuruş", type: "active", mpCost: 35, cooldown: 12000, damageMultiplier: 2.2 }
    }
  },
  // --- ŞAMAN ---
  shaman: {
    dragon: {
      1: { id: "shaman_1_1", name: "Ejderha Kükremesi", type: "active", mpCost: 40, cooldown: 15000, damageMultiplier: 1.5 },
      2: { id: "shaman_1_2", name: "Uçan Tılsım", type: "active", mpCost: 25, cooldown: 6000, damageMultiplier: 1.7 },
      3: { id: "shaman_1_3", name: "Yansıtma", type: "buff", mpCost: 50, cooldown: 30000, duration: 10000 },
      4: { id: "shaman_1_4", name: "Ejderha Yardımı", type: "buff_party", mpCost: 60, cooldown: 40000, duration: 20000 },
      5: { id: "shaman_1_5", name: "Kutsama", type: "buff_party", mpCost: 60, cooldown: 40000, duration: 20000 }
    },
    heal: {
      1: { id: "shaman_2_1", name: "Şimşek Atma", type: "active", mpCost: 30, cooldown: 7000, damageMultiplier: 1.8 },
      2: { id: "shaman_2_2", name: "Şimşek Çağırma", type: "active", mpCost: 40, cooldown: 10000, damageMultiplier: 2.1 },
      3: { id: "shaman_2_3", name: "Şimşek Pençesi", type: "active", mpCost: 50, cooldown: 12000, damageMultiplier: 2.3 },
      4: { id: "shaman_2_4", name: "Tedavi", type: "heal", mpCost: 40, cooldown: 10000 },
      5: { id: "shaman_2_5", name: "Yüksek Hız", type: "buff_party", mpCost: 60, cooldown: 40000, duration: 20000 }
    }
  },
  // --- LYCAN ---
  lycan: {
    instinct: {
      1: { id: "lycan_1_1", name: "Kurt Pençesi", type: "active", mpCost: 25, cooldown: 6000, damageMultiplier: 2.0 },
      2: { id: "lycan_1_2", name: "Kurt Nefesi", type: "active", mpCost: 35, cooldown: 10000, damageMultiplier: 1.8 },
      3: { id: "lycan_1_3", name: "Yırtma", type: "active", mpCost: 30, cooldown: 12000, damageMultiplier: 1.5 }, // Kanama
      4: { id: "lycan_1_4", name: "Kurt Ruhu", type: "buff", mpCost: 60, cooldown: 30000, duration: 15000 },
      5: { id: "lycan_1_5", name: "Kızıl Kurt Ruhu", type: "buff", mpCost: 70, cooldown: 40000, duration: 15000 }
    }
  }
};

/**
 * SKILL_DB'den bir beceri tanımını ID'ye göre bulur (örn: "warrior_1_1").
 */
function getSkillData(skillId) {
    if (!skillId) return null;
    const parts = skillId.split('_');
    const playerClass = parts[0];
    const setKey = Object.keys(SKILL_DB[playerClass])[parseInt(parts[1]) - 1];
    const skillNum = parts[2];
    
    if (SKILL_DB[playerClass] && SKILL_DB[playerClass][setKey] && SKILL_DB[playerClass][setKey][skillNum]) {
        return SKILL_DB[playerClass][setKey][skillNum];
    }
    return null;
}


// ---------------------- HARİTA + CLASS SPECS ----------------------
const MAP_DATA = {
  village: {
    width: 6440,
    height: 4480,
    safeZone: { x: 3200, y: 3000, radius: 1200 },
    portals: [
      { x: 3120, y: 0, width: 200, height: 40, targetMap: "forest", targetX: 3080, targetY: 4300 },
    ],
    allowedLevelRange: [1, 20], 
    zones: [
      { maxRadius: 1000, levelMin: 1, levelMax: 10 }, 
      { maxRadius: 3500, levelMin: 6, levelMax: 15 }, 
      { maxRadius: 4500, levelMin: 11, levelMax: 20 }, 
    ],
  },
  forest: {
    width: 6160,
    height: 4480,
    safeZone: { x: 3080, y: 4300, radius: 400 }, // YENİ: Orman giriş güvenli bölge
    portals: [
      { x: 2980, y: 4440, width: 200, height: 40, targetMap: "village", targetX: 3220, targetY: 100 },
      { x: 3000, y: 0, width: 200, height: 40, targetMap: "desert", targetX: 3000, targetY: 4300 },
    ],
    allowedLevelRange: [21, 40],
    zones: [ // YENİ: Orman için seviye bölgesi
        { maxRadius: 5000, levelMin: 21, levelMax: 40 } 
    ]
  },
  desert: {
    width: 6160,
    height: 4480,
    safeZone: { x: 3000, y: 4300, radius: 400 }, // YENİ: Çöl giriş güvenli bölge
    portals: [
      { x: 3000, y: 4440, width: 200, height: 40, targetMap: "forest", targetX: 3000, targetY: 100 },
      { x: 3000, y: 0, width: 200, height: 40, targetMap: "ice", targetX: 500, targetY: 4300 },
    ],
    allowedLevelRange: [41, 60],
    zones: [ // YENİ: Çöl için seviye bölgesi
        { maxRadius: 5000, levelMin: 41, levelMax: 60 }
    ]
  },
  ice: {
    width: 6160,
    height: 4480,
    safeZone: { x: 500, y: 4300, radius: 400 }, // YENİ: Buzul giriş güvenli bölge
    portals: [
      { x: 500, y: 4440, width: 200, height: 40, targetMap: "desert", targetX: 3000, targetY: 100 },
    ],
    allowedLevelRange: [61, 80],
    zones: [ // YENİ: Buzul için seviye bölgesi
        { maxRadius: 5000, levelMin: 61, levelMax: 80 }
    ]
  },
};

const CLASS_SPECS = {
  warrior: { width: 64, height: 64, baseDmg: 20 },
  ninja: { width: 64, height: 64, baseDmg: 18 },
  sura: { width: 64, height: 64, baseDmg: 22 },
  shaman: { width: 64, height: 64, baseDmg: 16 },
  lycan: { width: 64, height: 64, baseDmg: 25 },
  default: { width: 64, height: 64, baseDmg: 15 },
};



const PLAYER_SPEED = 6;
const ATTACK_RANGE = 80;
const ATTACK_COOLDOWN = 500;
const MAX_SKILL_LEVEL = 20; // YENİ EKLENEN SABİT
const MAX_CHARACTERS_PER_ACCOUNT = 5; // YENİ: Hesap başına maksimum karakter sayısı
const MOB_RESPAWN_TIME = 10000; // YENİ EKLENDİ: 10000ms = 10 Saniye

// ---------------------- NPC TANIMLARI ----------------------
const NPC_DEFINITIONS = [
  { id: "v_blacksmith", name: "Demirci", map: "village", x: 3400, y: 2800, asset: "blacksmith", hitbox: { width: 64, height: 64 } },
  { id: "v_merchant", name: "Satıcı", map: "village", x: 3000, y: 2800, asset: "merchant", hitbox: { width: 64, height: 64 } },
  { id: "v_warrior_m", name: "Savaşçı Ustası", map: "village", x: 2400, y: 3500, asset: "warrior", hitbox: { width: 64, height: 64 } },
  { id: "v_ninja_m", name: "Ninja Ustası", map: "village", x: 2540, y: 3500, asset: "ninja", hitbox: { width: 64, height: 64 } },
  { id: "v_sura_m", name: "Sura Ustası", map: "village", x: 4000, y: 3500, asset: "sura", hitbox: { width: 64, height: 64 } },
  { id: "v_shaman_m", name: "Şaman Ustası", map: "village", x: 4140, y: 3500, asset: "shaman", hitbox: { width: 64, height: 64 } },
  { id: "v_lycan_m", name: "Lycan Ustası", map: "village", x: 3200, y: 4000, asset: "lycan", hitbox: { width: 64, height: 64 } },
];

// ---------------------- NPC'LERİ BAŞLAT ----------------------
function initializeNpcs() {
  NPC_DEFINITIONS.forEach(def => {
    npcs[def.id] = {
      id: def.id,
      name: def.name,
      map: def.map,
      x: def.x,
      y: def.y,
      width: def.hitbox.width,
      height: def.hitbox.height,
      asset: def.asset,
      animState: "idle",
      animFrame: 0,
      animTicker: 0,
      direction: "down"
    };
  });
  console.log(`${Object.keys(npcs).length} NPC dünyaya yerleştirildi.`);
}

// ---------------------- PORTALLARI HAZIRLA ----------------------
// MAP_DATA içindeki portalları client’a göndermek için ayrı bir dizi
const PORTALS = [];
Object.keys(MAP_DATA).forEach(mapName => {
  const map = MAP_DATA[mapName];
  map.portals.forEach(p => {
    PORTALS.push({
      x: p.x + p.width / 2,   // Merkez noktası (client çizim için)
      y: p.y + p.height / 2,  // Merkez noktası
      width: p.width,
      height: p.height,
      map: mapName
    });
  });
});

// ---------------------- FONKSİYONLAR ----------------------
function handleAdminCommand(player, command) {
    const parts = command.toLowerCase().trim().split(' ');
    const cmd = parts[0]; 
    const value = parseInt(parts[2]) || 0; // Eğer komut /level 50 ise, value = 50
    
    // ... (Yang komutları burada devam eder) ...
    
    // 2. /level <miktar> (DÜZELTİLDİ)
    if (cmd === 'level' || cmd === 'setlevel') {
        const newLevel = parseInt(parts[1]); // Örn: /level 50 -> newLevel = 50

        if (newLevel >= 1 && newLevel <= 99) {
            
            // 1. Puanları Hesapla
            const oldLevel = player.level;
            const levelDifference = newLevel - oldLevel;
            
            if (levelDifference > 0) {
                // Her seviye için 3 Stat Puanı ve 1 Beceri Puanı ver
                player.statPoints += (levelDifference * 3);
                player.skillPoints += levelDifference;
            } else if (levelDifference < 0) {
                // Eğer seviye düşürülüyorsa, puanları geri alma (karmaşık, şimdilik vermeyi engelle)
                 return { type: 'error', message: "Seviye düşürme komutu bu versiyonda desteklenmemektedir." };
            } else {
                 return { type: 'error', message: "Mevcut seviyedesiniz." };
            }
            
            // 2. Seviyeyi Ayarla
            player.level = newLevel;
            
            // 3. EXP, HP ve MP'yi sıfırla/yenile
            player.exp = 0; 
            // Max EXP'yi yeni seviyeye göre yeniden hesaplamalısınız
            player.maxExp = Math.floor(1000 * Math.pow(1.5, newLevel - 1));
            player.hp = player.maxHp; 
            player.mp = player.maxMp;
            
            // Statü artışlarının HP/MP/DMG üzerindeki etkisini yeniden hesapla
            recalculatePlayerStats(player);
            
            return { 
                type: 'system', 
                message: `Seviyen ${newLevel} olarak ayarlandı. ${levelDifference * 3} Statü Puanı ve ${levelDifference} Beceri Puanı eklendi.` 
            };
        }
        return { type: 'error', message: "Kullanım: /level <1-99>" };
    }

    // ... (Heal komutları ve diğer komutlar buradan devam eder) ...
    
    // 3. /heal (Tam can/mana)
    if (cmd === 'heal') {
        player.hp = player.maxHp;
        player.mp = player.maxMp;
        return { type: 'system', message: "Canın ve Manan tamamen doldu." };
    }

    // 4. /komutlar (Admin komut listesi)
    if (cmd === 'komutlar' || cmd === 'help') {
        return { 
            type: 'system', 
            message: "Mevcut komutlar: /yang <miktar>, /level <seviye>, /heal" 
        };
    }
    
    return { type: 'error', message: `Bilinmeyen admin komutu: /${command}` };
}

function recalculatePlayerStats(player) {
    if (!player) return;

    const stats = player.stats;
    const equipment = player.equipment;
    const buffs = player.activeBuffs || {}; // Artık buff'ları da hesaba katacağız

    // --- YENİ: BUFF ETKİLERİNİ HESAPLAMA ---
    // Bu değişkenler, buff'lardan gelen geçici bonusları tutar
    let buffDmgBonus = 0;       // Örn: Büyülü Keskinlik
    let buffDefBonus = 0;       // Örn: Güçlü Beden, Büyülü Zırh
    let buffAtkSpeedBonus = 0;  // YENİ: Saldırı Hızı Bonusu (ms cinsinden düşüş)
    let buffMoveSpeedBonus = 0; // YENİ: Hareket Hızı Bonusu (Puan cinsinden)
    // (Gelecekte eklenebilir: buffHpBonus, buffMpBonus, vb.)

    // YENİ TEMİZLEME/SABİTLEME: Önce yüzde/durum buff'larını sıfırla
    player.damageReductionPercent = 0;
    player.criticalChanceBonus = 0;
    player.piercingChanceBonus = 0;
    player.isStealthed = false;
    player.manaShieldPercent = 0;
    player.reflectDamagePercent = 0;

    // --- BİREYSEL BUFF MANTIKLARI ---
    
    if (buffs["warrior_1_4"]) { // Öfke (Savaşçı)
        buffDmgBonus += 50; 
        buffMoveSpeedBonus += 3; 
        buffAtkSpeedBonus -= 100;
    }
    if (buffs["warrior_1_2"]) { // Hava Kılıcı
        buffDmgBonus += Math.floor(stats.str * 1.0); 
    }
    if (buffs["warrior_2_1"]) { // Güçlü Beden
        buffDefBonus += 150; 
        player.damageReductionPercent += 0.10; // +%10 Hasar Azaltma
    }
    if (buffs["ninja_2_5"]) { // Hafif Adım (Ninja)
        buffMoveSpeedBonus += 4; 
    }
    if (buffs["ninja_1_5"]) { // Kamuflaj (Ninja)
        player.isStealthed = true; // Görünmezlik
    }
    if (buffs["sura_1_1"]) { // Büyülü Keskinlik
        buffDmgBonus += Math.floor(stats.int * 1.5);
    }
    if (buffs["sura_1_2"]) { // Büyülü Zırh
        buffDefBonus += Math.floor(stats.int * 1.0);
        player.damageReductionPercent += 0.05; // +%5 Hasar Azaltma
    }
    if (buffs["sura_2_1"]) { // Karanlık Koruma
        player.manaShieldPercent = 0.30; // %30 Hasarı MP'den tüket
    }
    if (buffs["lycan_1_4"]) { // Kurt Ruhu
        player.criticalChanceBonus = 0.15; // %15 Kritik Şansı
    }
    if (buffs["lycan_1_5"]) { // Kızıl Kurt Ruhu
        player.piercingChanceBonus = 0.15; // %15 Delici Şansı
    }
    if (buffs["shaman_1_3"]) { // Yansıtma
        player.reflectDamagePercent = 0.15; // %15 Yansıtma
    }
    
    // --- YENİ BUFF BÖLÜMÜ SONU ---

    
    // (Diğer buff'lar buraya eklenebilir: Büyülü Koruma, Kutsama vb.)
    // --- YENİ BUFF BÖLÜMÜ SONU ---


    // 1. Eşyalardan gelen bonusları hesapla
    let bonusDmg = 0, bonusDef = 0, bonusHp = 0, bonusMp = 0, bonusSpeed = 0;
    Object.values(equipment).forEach(item => {
        if (!item) return;
        if (item.dmg) bonusDmg += item.dmg;
        if (item.def) bonusDef += item.def;
        if (item.hp) bonusHp += item.hp;
        if (item.mp) bonusMp += item.mp;
        if (item.speed) bonusSpeed += item.speed;
    });

    // 2. Statülerin etkilerini hesapla
    player.baseDef = Math.floor(stats.vit * 1.2 + stats.dex * 0.5); 
    player.magicAttack = Math.floor(stats.int * 2); 

    // 3. Eşya bonusları, STATÜ bonusları VE BUFF bonuslarını birleştir
    
    // Saldırı
    player.bonusDmg = bonusDmg + Math.floor(stats.str * 1.5 + stats.dex * 0.5) + buffDmgBonus; 
    // Toplam Defans
    player.bonusDef = bonusDef + player.baseDef + buffDefBonus; 
    // Bonus HP/MP (Aynı kalır)
    player.bonusHp = bonusHp + (stats.vit * 10); 
    player.bonusMp = bonusMp + (stats.int * 5);  
    
    // Hız: Eşya bonusu + BUFF Hız Bonusu
    player.bonusSpeed = bonusSpeed + buffMoveSpeedBonus; 
    
    // Saldırı Hızı: Sadece BUFF'lardan gelen fark
    player.bonusAttackSpeed = buffAtkSpeedBonus;

    // 4. Nihai Max Değerleri Ayarla
    player.maxHp = 100 + player.bonusHp;
    player.maxMp = 50 + player.bonusMp;

    // 5. Mevcut HP/MP'yi sınırlar içinde tut
    player.hp = Math.min(player.hp, player.maxHp);
    player.mp = Math.min(player.mp, player.maxMp);
}





/**
 * Oyuncu verilerini MongoDB'ye kaydeder.
 * (MongoDB Entegrasyonu)
 */
async function savePlayer(player) {
    if (!player) return;
    
    // 1. Sadece kalıcı verileri al
    const saveObject = { 
        name: player.name, kingdom: player.kingdom, class: player.class, 
        map: player.map, x: player.x, y: player.y, direction: player.direction,
        level: player.level, exp: player.exp, maxExp: player.maxExp, 
        hp: player.hp, maxHp: player.maxHp, mp: player.mp, maxMp: player.mp, 
        yang: player.yang,
        stats: player.stats, statPoints: player.statPoints, 
        inventory: player.inventory, equipment: player.equipment, 
        skillSet: player.skillSet, skills: player.skills, skillPoints: player.skillPoints, 
        activeBuffs: player.activeBuffs || {}
    };

    try {
        await PlayerModel.findOneAndUpdate(
            { name: player.name }, 
            { $set: saveObject },
            { upsert: true, new: true, runValidators: true }
        );
    } catch (error) {
        console.error(`Oyuncu ${player.name} kaydedilirken HATA:`, error);
    }
}

/**
 * Oyuncu verilerini MongoDB'den yükler.
 * (MongoDB Entegrasyonu)
 */
async function loadPlayer(playerName) {
    try {
        const data = await PlayerModel.findOne({ name: playerName }).lean(); 
        
        if (data) {
            delete data._id; 
            delete data.__v;
        }
        return data; 
    } catch (error) {
        console.error(`Oyuncu ${playerName} MongoDB'den yüklenirken HATA:`, error);
        return null;
    }
}

/**
 * Oyuncu nesnesini oluşturur veya MongoDB'den yükler.
 * (createPlayer ReferenceError hatasını çözer)
 */
async function createPlayer(socket, characterChoices) {
    const charName = characterChoices.name;
    const existingPlayer = await loadPlayer(charName);
    const isNew = !existingPlayer;

    let player;
    let baseStats = {};
    const DEFAULT_MAP_NAME = "village"; // Yerel değişken: default harita adı
    const DEFAULT_SPAWN_POSITION = { x: 3200, y: 2400 }; // Yerel değişken: default pozisyon
    const DEFAULT_BASE_STATS = { vit: 5, str: 5, int: 5, dex: 5 }; // Yerel değişken: default statlar

    let baseMap = DEFAULT_MAP_NAME;
    let basePos = DEFAULT_SPAWN_POSITION;

    if (isNew) {
        // Yeni Karakter Oluşturuluyor
        const charClass = characterChoices.class;
        const classSpec = CLASS_SPECS[charClass];
        baseStats = { ...DEFAULT_BASE_STATS, ...classSpec.baseStats };
        baseMap = classSpec.initialMap || DEFAULT_MAP_NAME;
        basePos = classSpec.initialPosition || DEFAULT_SPAWN_POSITION;
        
        // Yeni oyuncu verisini oluştur
        player = {
            id: socket.id,
            name: charName,
            kingdom: characterChoices.kingdom,
            class: charClass,
            map: baseMap,
            x: basePos.x,
            y: basePos.y,
            width: classSpec.width,    // KRİTİK: Genişlik ekle
            height: classSpec.height,  // KRİTİK: Yükseklik ekle
            baseDmg: classSpec.baseDmg, // KRİTİK: Base Dmg ekle
            direction: "down",
            level: 1,
            exp: 0,
            maxExp: 1000, 
            hp: 100, maxHp: 100, 
            mp: 50, maxMp: 50,
            yang: 0,
            stats: baseStats,
            statPoints: 0,
            
            // Envanter/Ekipman (Kalıcı Veriler)
            inventory: [],
            equipment: {}, 
            
            // Beceri Verileri (Kalıcı Veriler)
            skillSet: null, 
            skillPoints: 0, 
            skills: {}, 
            
            // Buff Verileri (Kalıcı Veriler, Şemaya eklenmişti)
            activeBuffs: {}, // KRİTİK: Boş obje olarak başlat
            
            // Kalıcı Olmayan/Geçici Veriler (Hata Çözümü İçin KRİTİK)
            animState: "idle",
            isAlive: true,
            isMoving: false,
            keysPressed: {}, // KRİTİK: Hareketin çalışması için boş obje
            lastAttack: 0,
            lastSkillUse: {}, // KRİTİK: Boş obje olarak başlat
            skillCooldowns: {}, // KRİTİK: Boş obje olarak başlat
            activeDebuffs: {}, // KRİTİK: Mob hasar mantığı için boş obje
            tradeId: null,
            lastChat: 0,
            
            // Hesaplama Sonucu Türetilen Statlar
            bonusSpeed: 0,
            bonusAttackSpeed: 0,
            damageReductionPercent: 0,
            criticalChanceBonus: 0,
            piercingChanceBonus: 0,
            isStealthed: false,
            manaShieldPercent: 0,
            reflectDamagePercent: 0,
        };
        
        

    } else {
        // Var Olan Karakter Yükleniyor
        const classSpec = CLASS_SPECS[existingPlayer.class];
        
        // MongoDB'den yüklenen veriyi kullanarak player objesini oluştur
        player = {
            id: socket.id,
            ...existingPlayer, 
            
            // KRİTİK: Eksik olabilecek default/türetilmiş değerleri ekle
            width: classSpec?.width || 64,
            height: classSpec?.height || 64,
            baseDmg: classSpec?.baseDmg || 20,
            
            // MongoDB'den yüklenen değerlerin üzerine yazan geçici veriler:
            
            // KRİTİK: Hareketi garantilemek için geçici state'leri sıfırla/yenile
            keysPressed: {}, // KRİTİK: Boş olarak başlat (Eski hareket verisi silinmeli)
            animState: "idle",
            isAlive: true, 
            isMoving: false,
            lastAttack: 0,
            
            // KRİTİK: Buff/Cooldown'ları yükle (yüklü değilse boş obje kullan)
            lastSkillUse: existingPlayer.lastSkillUse || {}, 
            skillCooldowns: existingPlayer.skillCooldowns || {}, 
            activeBuffs: existingPlayer.activeBuffs || {}, 
            
            // YENİ EK ZORUNLU ALANLAR
            activeDebuffs: {}, 
            tradeId: null,
            lastChat: 0,
            
            // Hesaplama Sonucu Türetilen Statlar (recalculatePlayerStats tarafından doldurulacak)
            bonusSpeed: 0,
            bonusAttackSpeed: 0,
            damageReductionPercent: 0,
            criticalChanceBonus: 0,
            piercingChanceBonus: 0,
            isStealthed: false,
            manaShieldPercent: 0,
            reflectDamagePercent: 0,
        };
        
        // Statüleri ekipman ve buff'lara göre yeniden hesapla
        recalculatePlayerStats(player);
    }

    // --- YENİ EKLENTİ: ADMIN KONTROLÜ ---
    const accountInfo = playerToAccountMap[socket.id];
    if (accountInfo && ADMIN_ACCOUNTS.includes(accountInfo.username)) {
        player.isAdmin = true;
    } else {
        player.isAdmin = false;
    }
    
    return player;
}

function spawnMob(mapName) { // YENİ: mapName argümanı eklendi
  // const mapName = "village"; // ESKİ: Bu satırı sil
  const map = MAP_DATA[mapName];
  if (!map) return;

  const mapLevelRange = map.allowedLevelRange || [1, 99]; // Güncellendi
  
  // YENİ: Güvenli bölge ayarları MAP_DATA'dan okundu
  const safeZone = map.safeZone || { x: map.width / 2, y: map.height / 2, radius: 0 };
  const mapCenter = { x: safeZone.x, y: safeZone.y }; 
  const safeZoneRadius = safeZone.radius; 
  
  let spawnX, spawnY, distanceToCenter;
  let attempts = 0;
  const maxAttempts = 100;

  // 1. Güvenli Bölge Dışında Rastgele Konum Bul
  do {
    spawnX = Math.random() * map.width;
    spawnY = Math.random() * map.height;
    
    const dx = spawnX - mapCenter.x;
    const dy = spawnY - mapCenter.y;
    distanceToCenter = Math.sqrt(dx * dx + dy * dy);
    attempts++;
    
  } while (distanceToCenter < safeZoneRadius && attempts < maxAttempts); 
  
  if (attempts >= maxAttempts && distanceToCenter < safeZoneRadius) return;


  // 2. Konuma Göre Seviye Aralığı Belirle (Kademeli Zorluk)
  let targetLevelMin = mapLevelRange[0];
  let targetLevelMax = mapLevelRange[1];

  if (map.zones) {
      // Bulunduğu mesafeye (distanceToCenter) göre hangi bölgeye ait olduğunu bul
      // YENİ: Uzaklığa göre en uygun bölgeyi bul (Köy dışındaki haritalar için)
      let currentZone = null;
      if (map.zones.length === 1) {
          currentZone = map.zones[0];
      } else {
          // Köy gibi çoklu zone varsa en yakınını bul
          currentZone = map.zones.find(zone => distanceToCenter <= zone.maxRadius);
      }
      
      if (currentZone) {
          targetLevelMin = currentZone.levelMin;
          targetLevelMax = currentZone.levelMax;
      }
  }

  // 3. Bölge Seviye Aralığına Uyan Mobları Filtrele
  // (Bu bölüm aynı kalıyor, zaten doğru çalışıyor)
  const validMobs = MOB_TYPES.filter(m => {
    return m.levelRange[1] >= targetLevelMin && m.levelRange[0] <= targetLevelMax;
  });
  
  if (validMobs.length === 0) {
    return;
  }
  
  // 4. Mob tipini rastgele seç
  // (Bu bölüm aynı kalıyor)
  const mobType = validMobs[Math.floor(Math.random() * validMobs.length)];
  
  // 5. Mob seviyesini aralık içinde rastgele belirle
  // (Bu bölüm aynı kalıyor)
  const levelMin = Math.max(mobType.levelRange[0], targetLevelMin);
  const levelMax = Math.min(mobType.levelRange[1], targetLevelMax);
  
  if (levelMin > levelMax) return; 
  
  const level = levelMin + Math.floor(Math.random() * (levelMax - levelMin + 1));
  
  // 6. Mob objesini oluştur (map: mapName kullandığından emin ol)
  const mob = {
    id: ++lastMobId,
    type: mobType.type,
    map: mapName, // Burası zaten doğru (mapName değişkenini kullanıyor)
    x: spawnX, 
    y: spawnY, 
    spawnX: spawnX, 
    spawnY: spawnY, 
    width: mobType.size,
    height: mobType.size,
    color: mobType.color,
    level: level,
    hp: mobType.baseHp + level * 5,
    maxHp: mobType.baseHp + level * 5,
    dmg: mobType.dmg + Math.floor(level / 3),
    exp: mobType.exp + level * 2,
    dropRate: mobType.dropRate,
    drops: mobType.drops,
    isAlive: true,
    animFrame: 0,
    animTicker: 0,
    
    asset: mobType.asset,      
    idleSpeed: mobType.idleSpeed, 
    
    isAggressive: mobType.isAggressive || false,
    moveSpeed: mobType.moveSpeed || 3,
    aggroRange: mobType.aggroRange || 200,
    attackRange: mobType.attackRange || 50,
    attackSpeed: mobType.attackSpeed || 1000,
    lastAttack: 0,
    targetId: null, 
    isLeashing: false 
  };

  mobs[mob.id] = mob;
}



// server.js (spawnMetin fonksiyonunun GÜNCELLENMİŞ TAMAMI)

function spawnMetin(mapName) { 
    const map = MAP_DATA[mapName];
    if (!map) return;

    // Harita seviyesine uygun Metinleri filtrele
    const validMetins = METIN_TYPES.filter(m => {
        return m.levelRange[1] >= map.allowedLevelRange[0] && m.levelRange[0] <= map.allowedLevelRange[1];
    });
    
    if (validMetins.length === 0) return;

    const metinType = validMetins[Math.floor(Math.random() * validMetins.length)];

    // Güvenli Bölge Dışında Rastgele Konum Bulma (spawnMob ile aynı mantık)
    const safeZone = map.safeZone || { x: map.width / 2, y: map.height / 2, radius: 0 };
    const mapCenter = { x: safeZone.x, y: safeZone.y }; 
    const safeZoneRadius = safeZone.radius; 
    
    let spawnX, spawnY, distanceToCenter;
    let attempts = 0;
    const maxAttempts = 100;

    do {
      spawnX = Math.random() * map.width;
      spawnY = Math.random() * map.height;
      
      const dx = spawnX - mapCenter.x;
      const dy = spawnY - mapCenter.y;
      distanceToCenter = Math.sqrt(dx * dx + dy * dy);
      attempts++;
      
    } while (distanceToCenter < safeZoneRadius && attempts < maxAttempts); 
    
    if (attempts >= maxAttempts && distanceToCenter < safeZoneRadius) return;

    // Seviyeyi aralık içinde rastgele belirle
    const level = metinType.levelRange[0] + Math.floor(Math.random() * (metinType.levelRange[1] - metinType.levelRange[0] + 1));

    // Metin Mob objesini oluştur
    const metin = {
        id: ++lastMobId,
        type: metinType.type,
        map: mapName, 
        x: spawnX, 
        y: spawnY, 
        spawnX: spawnX, 
        spawnY: spawnY, 
        width: metinType.size,
        height: metinType.size,
        color: metinType.color, // Metinler için kullanılmayacak ama kalsın
        level: level,
        hp: metinType.baseHp, // Metinlerin HP'si sabittir
        maxHp: metinType.baseHp,
        dmg: 0, // Metinler saldıramaz
        exp: metinType.exp,
        dropRate: metinType.dropRate,
        drops: [], // Metinler kendi drop havuzuna sahip
        isAlive: true,
        animFrame: 0,
        animTicker: 0,
        asset: metinType.asset,      
        isAggressive: false,
        moveSpeed: 0,
        attackRange: 0,
        
        isMetin: true,          // KRİTİK: Bu bir Metin taşıdır
        spawnMobTypes: metinType.mobTypes,
        spawnMobLevelRange: metinType.mobLevelRange,
        mobSpawnCount: metinType.mobCount,
        spawnCount: metinType.spawnCount,    // Kalan dalga sayısı
        maxSpawnCount: metinType.spawnCount, // Toplam dalga sayısı
        // hpThreshold: metinType.baseHp / metinType.spawnCount // Bu artık gereksiz, attack eventinde dinamik hesaplanıyor
    };

    mobs[metin.id] = metin;
}

// server.js (spawnMob fonksiyonunu bulun)

/**
 * Normal bir mob'u haritada uygun bir konuma yerleştirir.
 * @param {string} mapName - Harita adı.
 * @param {object} [options] - Opsiyonel: Metin içinden spawn ediliyorsa (parentX, parentY, forcedType, forcedLevel).
 */
function spawnMob(mapName, options = {}) { 
    // KRİTİK DÜZELTME: map değişkenini fonksiyonun başında tanımla
    const map = MAP_DATA[mapName];
    if (!map) return; // Harita verisi yoksa çık

    const mapLevelRange = map.allowedLevelRange || [1, 99]; 
    const safeZone = map.safeZone || { x: map.width / 2, y: map.height / 2, radius: 0 };
    const mapCenter = { x: safeZone.x, y: safeZone.y }; 
    const safeZoneRadius = safeZone.radius; 

    let spawnX, spawnY, level, mobType;

    if (options.parentX !== undefined) {
        // Metin içinden çıkıyorsa: Metinin etrafına rastgele konumlandır
        spawnX = options.parentX + (Math.random() * 100 - 50);
        spawnY = options.parentY + (Math.random() * 100 - 50);
        
        // Metin'den gelen zorunlu tip ve seviyeyi kullan
        mobType = MOB_TYPES.find(m => m.type === options.forcedType);
        level = options.forcedLevel;
        
    } else {
        // Normal harita spawn:
        
        // 1. Güvenli Bölge Dışında Rastgele Konum Bul
        let attempts = 0;
        const maxAttempts = 100;
        let distanceToCenter;
        
        do {
          spawnX = Math.random() * map.width;
          spawnY = Math.random() * map.height;
          
          const dx = spawnX - mapCenter.x;
          const dy = spawnY - mapCenter.y;
          distanceToCenter = Math.sqrt(dx * dx + dy * dy);
          attempts++;
          
        } while (distanceToCenter < safeZoneRadius && attempts < maxAttempts); 
        
        if (attempts >= maxAttempts && distanceToCenter < safeZoneRadius) return;


        // 2. Konuma Göre Seviye Aralığı Belirle (Kademeli Zorluk)
        let targetLevelMin = mapLevelRange[0];
        let targetLevelMax = mapLevelRange[1];

        if (map.zones) {
            let currentZone = null;
            if (map.zones.length === 1) {
                currentZone = map.zones[0];
            } else {
                currentZone = map.zones.find(zone => distanceToCenter <= zone.maxRadius);
            }
            
            if (currentZone) {
                targetLevelMin = currentZone.levelMin;
                targetLevelMax = currentZone.levelMax;
            }
        }

        // 3. Bölge Seviye Aralığına Uyan Mobları Filtrele
        const validMobs = MOB_TYPES.filter(m => {
          return m.levelRange[1] >= targetLevelMin && m.levelRange[0] <= targetLevelMax;
        });
        
        if (validMobs.length === 0) {
          return;
        }
        
        // 4. Mob tipini rastgele seç
        mobType = validMobs[Math.floor(Math.random() * validMobs.length)];
        
        // 5. Mob seviyesini aralık içinde rastgele belirle
        const levelMin = Math.max(mobType.levelRange[0], targetLevelMin);
        const levelMax = Math.min(mobType.levelRange[1], targetLevelMax);
        
        if (levelMin > levelMax) return; 
        
        level = levelMin + Math.floor(Math.random() * (levelMax - levelMin + 1));
        
    } 

    // 6. Mob objesini oluştur
    const mob = {
        id: ++lastMobId,
        type: mobType.type,
        map: mapName,
        x: spawnX, 
        y: spawnY, 
        spawnX: spawnX, 
        spawnY: spawnY, 
        width: mobType.size,
        height: mobType.size,
        color: mobType.color,
        level: level,
        hp: mobType.baseHp + level * 5,
        maxHp: mobType.baseHp + level * 5,
        dmg: mobType.dmg + Math.floor(level / 3),
        exp: mobType.exp + level * 2,
        dropRate: mobType.dropRate,
        drops: mobType.drops,
        isAlive: true,
        animFrame: 0,
        animTicker: 0,
        
        asset: mobType.asset,      
        idleSpeed: mobType.idleSpeed, 
        
        isAggressive: mobType.isAggressive || false,
        moveSpeed: mobType.moveSpeed || 3,
        aggroRange: mobType.aggroRange || 200,
        attackRange: mobType.attackRange || 50,
        attackSpeed: mobType.attackSpeed || 1000,
        lastAttack: 0,
        targetId: null, 
        isLeashing: false 
    };

    mobs[mob.id] = mob;
}

// server.js

function giveExp(playersToGive, exp) {
    // Tek bir oyuncu objesi geldiyse, onu 1 elemanlı bir diziye çevir
    const recipients = Array.isArray(playersToGive) ? playersToGive : [playersToGive];
    
    // Basit dağıtım: Toplam EXP'yi üye sayısına böl
    const expPerPlayer = Math.floor(exp / recipients.length);
    
    recipients.forEach(player => {
        // Herkese eşit payı ver
        player.exp += expPerPlayer;
        
        // Seviye atlama kontrolü (Mevcut logic aynı kalır)
        while (player.exp >= player.maxExp) {
            player.level++;
            player.skillPoints++; 
            player.statPoints += 3;
            player.exp -= player.maxExp;
            player.maxExp = Math.floor(player.maxExp * 1.5);
            player.hp = player.maxHp;
            player.mp = player.maxMp;

            // 5. Seviye beceri bildirimi
             if (player.level === 5 && player.skillSet === null) {
              const socket = io.sockets.sockets.get(player.id);
              if (socket) {
                socket.emit("showNotification", {
                  title: "Beceri Ustası",
                  message: `Tebrikler, 5. Seviye oldun! Köydeki sınıf ustana (${player.class} Ustası) giderek ilk becerilerini öğretebilirsin.`
                });
              }
            }
        }
    });
}



// YENİ FONKSİYON (İÇİ DOLDURULMUŞ HALİ)
function handlePlayerDeath(player) {
  // Zaten ölüysa (örn: iki mob aynı anda vurduysa) tekrar çalıştırma
  if (!player || !player.isAlive) return; 

  console.log(`${player.name} öldü!`);
  player.isAlive = false;
  player.hp = 0; // HP'yi 0'a sabitle
  
  // İSTEĞİNİZ: Ölüm animasyonu olarak 'hurt'u ayarla
  player.animState = "hurt"; 
  
  // Sunucu tarafında da hareketi hemen durdur
  player.keysPressed = { w: false, a: false, s: false, d: false };


  // --- YENİ EKLENEN YENİDEN DOĞMA MANTIĞI ---
  // Oyuncuyu 5 saniye sonra köyde dirilt
  setTimeout(() => {
    // Oyuncu bu 5 saniye içinde oyundan çıkmış olabilir, kontrol et
    if (players[player.id]) { 
      player.hp = player.maxHp / 2; // Yarım canla
      player.mp = player.maxMp / 2; // Yarım mana ile
      player.isAlive = true;
      player.map = "village";      // Köy haritası
      player.x = 3200;             // Köy başlangıç X
      player.y = 2400;             // Köy başlangıç Y
      player.animState = "idle";   // Normal animasyona dön
      player.targetId = null;      // (Eğer varsa) mob hedefinden çıkar
      
      console.log(`${player.name} köyde dirildi!`);
      
      // NOT: Mobların hedef listesini de temizlemek iyi bir pratik olur
      // (Şu anki kodda moblar zaten ölü oyuncuyu hedef almıyor)
    }
  }, 5000); // 5000ms = 5 saniye
  // --- YENİDEN DOĞMA MANTIĞI SONU ---
}

function spawnInitialMobs() {
  let count = 0;
  // Normal mobları oluştur
  while (count < 40) {
    spawnMob("village"); 
    count++;
  }
  
  // Metin taşlarını oluştur (Harita başına 2-3 adet)
  // spawnMetin fonksiyonunu doğrudan çağır
  
  // Village (Köy) Metinleri
  spawnMetin("village");
  spawnMetin("village");
  spawnMetin("village"); // 3 adet

  // Forest (Orman) Metinleri
  spawnMetin("forest");
  spawnMetin("forest"); // 2 adet
  
  // Desert (Çöl) Metinleri
  spawnMetin("desert");
  spawnMetin("desert"); // 2 adet

  // Ice (Buzul) Metinleri (Opsiyonel, harita level aralığı 61-80)
  // spawnMetin("ice"); 
}

// ---------------------- SOCKET BAĞLANTISI ----------------------
io.on("connection", (socket) => {
  console.log("Yeni oyuncu:", socket.id);

  socket.on("playerJoin", (data) => {
    const player = createPlayer(socket, data);
    console.log(`${player.name} oyuna katıldı! (${player.class})`);
    // PORTALLARI İLK BAĞLANTIDA GÖNDER
    socket.emit("gameState", { players, mobs, npcs, portals: PORTALS });
  });

  socket.on("keyStateChange", ({ key, pressed }) => {
    const player = players[socket.id];
    if (player) player.keysPressed[key] = pressed;
  });

  socket.on("attack", () => {
  const player = players[socket.id];
    // YENİ: Toplam Cooldown = Sabit Değer + Buff Bonusu (negatif değer)
  const totalCooldown = ATTACK_COOLDOWN + player.bonusAttackSpeed;

  // YENİ: Ölü oyuncu saldıramaz
  if (!player || !player.isAlive || Date.now() - player.lastAttack < ATTACK_COOLDOWN) return;
  player.lastAttack = Date.now();
    player.animState = "slash";

    const totalDmg = player.baseDmg + player.bonusDmg;

    for (const mobId in mobs) {
      const mob = mobs[mobId];
      if (mob.map === player.map && mob.isAlive && distance(player, mob) < ATTACK_RANGE) {
        
        // YENİ: METİN TAŞI MANTIĞI
        if (mob.isMetin) {
            
            // Eğer spawnCount sıfır veya negatifse (tüm moblar çıktıysa) daha fazla kontrol etme
            if (mob.spawnCount <= 0) {
                // ...
            } else {
                
                // KRİTİK EŞİK KONTROLÜ
                const maxSpawnThreshold = mob.maxHp * (mob.maxSpawnCount / mob.maxSpawnCount); // 500 * 1 = 500
                const currentSpawnThreshold = mob.maxHp * ((mob.spawnCount - 1) / mob.maxSpawnCount); // Örneğin: 500 * (4/5) = 400
                
                // Kontrol: Mevcut can (hp), ilk spawn eşiği mi (500) VE hasar sonrası bir sonraki eşiğin (400) altına mı düşüyor?
                // VEYA: Mevcut can (hp) bir önceki eşiğin üstünde mi VE hasar sonrası altına mı düşüyor?
                
                let shouldSpawn = false;

                // A. İLK VURUŞ KONTROLÜ (Can %100'deyken)
                if (mob.hp === mob.maxHp && (mob.hp - totalDmg) < mob.maxHp) {
                    shouldSpawn = true;
                } 
                // B. SONRAKİ VURUŞLARDAKİ EŞİK KONTROLÜ
                else if (mob.hp > currentSpawnThreshold && (mob.hp - totalDmg) <= currentSpawnThreshold) {
                    shouldSpawn = true;
                }

                if (shouldSpawn) {
                    
                    // Mob çıkar!
                    const count = Math.floor(Math.random() * (mob.mobSpawnCount[1] - mob.mobSpawnCount[0] + 1)) + mob.mobSpawnCount[0];
                    
                    for (let i = 0; i < count; i++) {
                        // Metin'den çıkacak Mob'un tipi ve seviyesi
                        const mobTypeToSpawn = mob.spawnMobTypes[Math.floor(Math.random() * mob.spawnMobTypes.length)];
                        const levelToSpawn = mob.spawnMobLevelRange[0] + Math.floor(Math.random() * (mob.spawnMobLevelRange[1] - mob.spawnMobLevelRange[0] + 1));
                        
                        spawnMob(mob.map, {
                            parentX: mob.x, 
                            parentY: mob.y, 
                            forcedType: mobTypeToSpawn, 
                            forcedLevel: levelToSpawn
                        });
                    }
                    
                    mob.spawnCount--; // Spawn hakkını 1 azalt (KRİTİK)
                    
                    socket.emit("showNotification", {
                        title: "Metin Taşından Canavar Çıktı!",
                        message: `${mob.type} içinden yeni canavarlar fırladı! Kalan dalga: ${mob.spawnCount}`
                    });
                }
            }
            
        }
        // METİN TAŞI MANTIĞI SONU
        
        // CANAVAR HASAR ALDI
        mob.hp -= totalDmg;
        
        // YENİ: REAKTİF AI TETİKLEMESİ (Sadece normal moblar için)
        if (!mob.isMetin) { 
          // Canavar hayattaysa VE bir hedefi yoksa, saldırana hedef al
          if (mob.hp > 0 && !mob.targetId) {
            mob.targetId = player.id;
          }
        }


        // CANAVAR ÖLDÜ / METİN KIRILDI
if (mob.hp <= 0) {
    mob.isAlive = false;
    mob.deathTime = Date.now(); 

    // --- KRİTİK DÜZELTME: PARTİ EXP PAYLAŞIM MANTIĞI BAŞLANGICI ---
    // Varsayılan alıcı: Sadece saldıran oyuncu
    let expRecipients = [player]; 

    if (player.partyId) {
        const party = parties[player.partyId];
        if (party) {
            // 1. Partideki uygun diğer üyeleri bul (Killer hariç)
            const eligiblePartyMembers = party.members
                // Killer'ı filtreleme işleminden önce çıkar (Çünkü Killer EXP'yi her zaman alır)
                .filter(memberId => memberId !== player.id) 
                .map(memberId => players[memberId])
                .filter(member => 
                    member && 
                    member.map === player.map &&      // Aynı haritada mı?
                    member.isAlive &&
                    member.level >= mob.level - 15 &&  // Mob seviyesinden 5 düşük veya üstü
                    distance(member, mob) < 1600      // <<< GÜNCELLENDİ: Uzaklık 800'den 1200'e çıkarıldı
                );
            
            // 2. Alıcılar listesi: Killer + Uygun Party Üyeleri
            expRecipients = [player, ...eligiblePartyMembers]; 
        }
    }
    
    // EXP'yi belirlenen oyunculara dağıt (expRecipients dizisinin boyutuna bölünür)
    // (Debug logu kullanıcının isteği üzerine eklendi)
    console.log(`[EXP LOG] Mob EXP: ${mob.exp}. Alıcı Sayısı: ${expRecipients.length}. Kişi Başı EXP: ${Math.floor(mob.exp / expRecipients.length)}`);
    giveExp(expRecipients, mob.exp); 
    // --- PARTİ EXP PAYLAŞIM MANTIĞI SONU ---
          
          
          if (mob.isMetin) {
              // --- METİN DROP VE YANG MANTIĞI ---
              
              const droppedYang = mob.level * (Math.floor(Math.random() * 501) + 500); // Daha fazla yang
              player.yang += droppedYang; 
              
              socket.emit("showNotification", {
                title: "Metin Taşı Kırıldı!",
                message: `${mob.type} Metin Taşı'nı kırdın! ${droppedYang.toLocaleString()} Yang kazandın.`
              });
              
              // Metin Drop'ları (yüksek seviye potlar)
              if (Math.random() < mob.dropRate) {
                  // Büyük kırmızı/mavi pot veya başka bir özel item düşür
                  const dropId = (Math.random() < 0.5) ? 9003 : 9013; 
                  const itemTemplate = ITEM_DB[dropId];
                  
                  if (itemTemplate) {
                      const item = { ...itemTemplate, quantity: 1 };
                      
                      let itemAdded = false;
                      
                      // 1. Tüketilebilir (Pot) ise birleştirmeyi (stack) dene
                      if (item.type === 'consumable') {
                          const existingStackIndex = player.inventory.findIndex(i => i && i.id === item.id && (i.quantity || 0) < 200);
                          if (existingStackIndex !== -1) {
                              player.inventory[existingStackIndex].quantity = (player.inventory[existingStackIndex].quantity || 1) + 1; 
                              itemAdded = true;
                          }
                      }
                      
                      // 2. Birleşmediyse (veya pot değilse), boş slot ara
                      if (!itemAdded) {
                          const index = player.inventory.findIndex(slot => slot === null);
                          if (index > -1) {
                              if (item.type === 'consumable') {
                                  item.quantity = 1; 
                              }
                              player.inventory[index] = item;
                              itemAdded = true;
                          }
                      }

                      if (itemAdded) {
                          socket.emit("showNotification", {
                              title: "Eşya Düştü!",
                              message: `${mob.type} metninden **${item.name}** kazandın.`
                          });
                      } else {
                          socket.emit("showNotification", {
                              title: "Envanter Dolu!",
                              message: `Envanteriniz dolu, ${item.name} yere düştü (ve kayboldu!)`
                          });
                      }
                  }
              }
              
              // KRİTİK: Metinse, onu Respawn listesine ekle ve mob listesinden çıkar
              deadMetins[mobId] = { 
                  type: mob.type,
                  map: mob.map,
                  respawnTime: Date.now() + METIN_RESPAWN_TIME // 1 dakika sonra
              };
              delete mobs[mobId]; 

          } else {
              // --- NORMAL MOB YANG VE DROP MANTIĞI ---

              const droppedYang = mob.level * (Math.floor(Math.random() * 101) + 50);
              player.yang += droppedYang; 
              
              socket.emit("showNotification", {
                title: "Yang Düştü!",
                message: `${mob.type} canavarından ${droppedYang.toLocaleString()} Yang kazandın.` 
              });
              
              // Normal Mob Eşya Düşürme Mantığı
              if (Math.random() < mob.dropRate) {
                const itemId = mob.drops[Math.floor(Math.random() * mob.drops.length)];
                const itemTemplate = ITEM_DB[itemId];
                if (itemTemplate) { // Güvenlik kontrolü
                
                    const item = { ...itemTemplate }; 
                    let itemAdded = false;

                    // 1. Tüketilebilir (Pot) ise birleştirmeyi (stack) dene
                    if (item.type === 'consumable') {
                        const existingStackIndex = player.inventory.findIndex(i => i && i.id === item.id && (i.quantity || 0) < 200);
                        if (existingStackIndex !== -1) {
                            player.inventory[existingStackIndex].quantity = (player.inventory[existingStackIndex].quantity || 1) + 1; 
                            itemAdded = true;
                        }
                    }
                    
                    // 2. Birleşmediyse (veya pot değilse), boş slot ara
                    if (!itemAdded) {
                        const index = player.inventory.findIndex(slot => slot === null);
                        if (index > -1) {
                            if (item.type === 'consumable') {
                                item.quantity = 1; 
                            }
                            player.inventory[index] = item;
                            itemAdded = true;
                        }
                    }

                    // 3. Ekleme başarılı olduysa bildirim gönder
                    if (itemAdded) {
                        socket.emit("showNotification", {
                            title: "Eşya Düştü!",
                            message: `${mob.type} canavarından **${item.name}** kazandın.`
                        });
                    } else {
                        socket.emit("showNotification", {
                            title: "Envanter Dolu!",
                            message: `Envanteriniz dolu, ${item.name} yere düştü (ve kayboldu!)`
                        });
                    }
                }
              }
          }
        } // if (mob.hp <= 0) sonu
      }
    }
  });

  socket.on("slashFinished", ({ playerId }) => {
    if (players[playerId]) players[playerId].animState = "idle";
  });

  socket.on("equipItem", ({ type, item, inventoryIndex }) => { // inventoryIndex'i ekledik
    const player = players[socket.id];
    if (!player || !item) return;

    // 1. SINIF UYGUNLUĞU KONTROLÜ
    if (item.forClass && item.forClass !== player.class) {
        socket.emit("showNotification", { 
            title: "Kuşanma Hatası", 
            message: `**${item.name}** eşyası sadece ${item.forClass.toUpperCase()} sınıfı için uygundur.` 
        });
        return; 
    }
    
    // 2. SEVİYE UYGUNLUĞU KONTROLÜ (requiredLevel varsa)
    if (item.requiredLevel && player.level < item.requiredLevel) {
        socket.emit("showNotification", { 
            title: "Kuşanma Hatası", 
            message: `Bu eşyayı kuşanmak için **${item.requiredLevel}. seviye** olmalısın. (Mevcut Seviye: ${player.level})` 
        });
        return; 
    }

    // Kuşanma başarılı:
    
    // Eski eşyayı kaydet
    const oldItem = player.equipment[type];

    // Yeni eşyayı kuşan
    player.equipment[type] = item;
    recalculatePlayerStats(player);
    
    // 1. Client'a envanterden silmesi için sinyal gönder
    socket.emit("itemEquipped", { 
        equippedItem: item,
        inventoryIndex: inventoryIndex,
        oldItem: oldItem // Eski item varsa client'a gönderiyoruz
    });
    
    // 2. Client'a kuşanma UI'ını güncellemesi için sinyal gönder
    socket.emit("equipmentUpdated", { equipment: player.equipment });
    
    // NOT: Server'da item silme işlemini YAPMIYORUZ, sadece client'a bildiriyoruz.
  });

  socket.on("unequipItem", ({ type }) => {
    const player = players[socket.id];
    if (!player || !player.equipment[type]) return;
    const item = player.equipment[type];
    player.equipment[type] = null;
    recalculatePlayerStats(player);
    socket.emit("itemToInventory", item);
    socket.emit("equipmentUpdated", { equipment: player.equipment });
  });
  // YENİ: BECERİ SETİ SEÇİMİNİ İŞLEYEN EVENT
  socket.on("chooseSkillSet", (skillSetKey) => {
    const player = players[socket.id];

    // --- Güvenlik Kontrolleri ---
    if (!player) return;
    if (player.level < 5) {
      socket.emit("showNotification", { title: "Hata", message: "Beceri seçmek için 5. seviye olmalısın." });
      return;
    }
    if (player.skillSet !== null) {
      socket.emit("showNotification", { title: "Hata", message: "Zaten bir beceri seti seçmişsin." });
      return;
    }

    // Seçimin geçerli olup olmadığını SKILL_DB'den kontrol et
    // (SKILL_DB'yi bir önceki adımda eklediğinizi varsayıyorum)
    const classSkills = SKILL_DB[player.class]; 
    if (!classSkills || !classSkills[skillSetKey]) {
      console.error(`HATA: Oyuncu ${player.name} geçersiz bir beceri seti seçmeye çalıştı: ${skillSetKey}`);
      return;
    }
    
    // --- Seçimi Uygula ---
    player.skillSet = skillSetKey;
    
    // Oyuncunun 'skills' objesini seçtiği setin becerileriyle doldur (hepsi seviye 0)
    const newSkills = {};
    const skillsToLearn = classSkills[skillSetKey];
    for (const skillNum in skillsToLearn) {
        const skillData = skillsToLearn[skillNum];
        newSkills[skillData.id] = 0; // Becerinin ID'sini key yap, seviyesini 0 yap
    }
    player.skills = newSkills;
    
    console.log(`${player.name} adlı oyuncu [${skillSetKey}] beceri setini seçti.`);

    // Client'a seçimin onaylandığını ve yeni beceri listesini gönder
    socket.emit("skillSetChosen", {
        skillSet: player.skillSet,
        skills: player.skills,
        skillPoints: player.skillPoints
    });

    // Başarı bildirimi gönder
    socket.emit("showNotification", {
        title: "Başarılı!",
        message: `Yeni becerilerin açıldı. 'K' tuşuna basarak beceri panelini açabilir ve puanlarını dağıtabilirsin.`
    });
  });

  // YENİ: BECERİ PUANI HARCAMA EVENTİ
  socket.on("spendSkillPoint", (skillId) => {
    const player = players[socket.id];

    // --- Güvenlik Kontrolleri ---
    if (!player) return;
    
    // 1. Puanı var mı?
    if (player.skillPoints <= 0) {
        socket.emit("showNotification", { title: "Hata", message: "Yeterli beceri puanın yok." });
        return;
    }
    // 2. Bu beceriye sahip mi?
    if (player.skills[skillId] === undefined) {
        console.warn(`Oyuncu ${player.name} sahip olmadığı bir beceriyi (${skillId}) yükseltmeye çalıştı.`);
        return;
    }
    // 3. Beceri maksimum seviyede mi?
    const currentLevel = player.skills[skillId];
    if (currentLevel >= MAX_SKILL_LEVEL) {
        socket.emit("showNotification", { title: "Hata", message: "Bu beceri zaten maksimum seviyede." });
        return;
    }

    // --- Başarılı: Puanı harca ve seviyeyi yükselt ---
    player.skillPoints--;
    player.skills[skillId]++;
    
    console.log(`${player.name}, ${skillId} becerisini ${player.skills[skillId]} seviyesine yükseltti.`);

    // Değişikliği onaylamak ve UI'ı güncellemek için client'a geri gönder
    socket.emit("playerSkillsUpdated", {
        skills: player.skills,
        skillPoints: player.skillPoints
    });
  });

  // YENİ: BECERİ KULLANMA EVENTİ
socket.on("useSkill", ({ skillId, slotIndex }) => {
    const player = players[socket.id];
    if (!player || !player.isAlive) return;

    // 1. Becerinin verisini DB'den al
    const skillData = getSkillData(skillId);
    if (!skillData) {
      console.warn(`Oyuncu ${player.name} geçersiz beceri ID'si kullandı: ${skillId}`);
      return;
    }

    // 2. Oyuncu bu beceriyi öğrenmiş mi?
    if (player.skills[skillId] === undefined || player.skills[skillId] <= 0) {
      socket.emit("skillError", { message: "Bu beceriyi henüz öğrenmedin." });
      return;
    }
    const skillLevel = player.skills[skillId];

    // 3. Yeterli MP var mı?
    const mpCost = skillData.mpCost + (skillLevel * 2); // Seviye başına +2 MP maliyeti
    if (player.mp < mpCost) {
      socket.emit("skillError", { message: "Yeterli Mana yok." });
      return;
    }

    // 4. Beceri bekleme süresinde mi?
    const now = Date.now();
    player.skillCooldowns = player.skillCooldowns || {};
    const cooldownEnds = player.skillCooldowns[skillId] || 0;
    
    // Buff kontrolü: Zaten aktifse kullandırtma
    if (skillData.type === "buff" && player.activeBuffs[skillId] && player.activeBuffs[skillId] > now) {
         socket.emit("skillError", { message: "Bu güçlendirme zaten aktif." });
         return;
    }
    // Normal cooldown kontrolü
    if (now < cooldownEnds) {
      const remaining = ((cooldownEnds - now) / 1000).toFixed(1);
      socket.emit("skillError", { message: `Beceri ${remaining}sn içinde hazır olacak.` });
      return;
    }

    // --- BECERİ KULLANIMI BAŞARILI ---
    
    // 5. MP'yi düş
    player.mp -= mpCost;

    // 6. Yeni bekleme süresini ayarla
    const cooldownDuration = skillData.cooldown;
    player.skillCooldowns[skillId] = now + cooldownDuration;

    // 7. Beceri efektini uygula
    
    // 7a. Hasar ve Statü Hesaplaması
    let totalDamage = 0;
    const skillLevelBonus = skillLevel * 20; // Her beceri puanı +20 düz hasar/etki
    const physicalBase = player.baseDmg + player.bonusDmg; 
    const magicalBase = player.magicAttack; 

    if (player.class === 'warrior') {
        totalDamage = (physicalBase + (player.stats.str * 2) + skillLevelBonus) * skillData.damageMultiplier;
    } else if (player.class === 'ninja') {
        totalDamage = (physicalBase + (player.stats.dex * 2) + skillLevelBonus) * skillData.damageMultiplier;
    } else if (['sura', 'shaman', 'lycan'].includes(player.class)) {
        totalDamage = (magicalBase + (player.stats.int * 2) + skillLevelBonus) * skillData.damageMultiplier;
    }
    totalDamage = Math.floor(totalDamage);

    // 7b. Beceri Tipine Göre Efekt Uygula
    if (skillData.type === "active") {
        console.log(`${player.name}, ${skillData.name} (Lv.${skillLevel}) kullandı. Hasar: ${totalDamage}`);
        
        const isAoE = skillData.name.includes("Çevirme") || skillData.name.includes("Yağmuru") || skillData.name.includes("Küre") || skillData.name.includes("Dönüşü") || skillData.name.includes("Kükremesi");
        let targetsHit = 0;
        let closestMob = null;
        let minDistance = ATTACK_RANGE + 1;

        for (const mobId in mobs) {
            const mob = mobs[mobId];
            if (mob.map !== player.map || !mob.isAlive) continue;
            const dist = distance(player, mob);
            if (dist > ATTACK_RANGE) continue;

            if (isAoE) {
                mob.hp -= totalDamage;
                targetsHit++;
                if (mob.hp > 0 && !mob.targetId) mob.targetId = player.id;
                // NOT: AoE içinde debuff uygulamak isterseniz bu alana eklemelisiniz.
            } else {
                if (dist < minDistance) {
                    minDistance = dist;
                    closestMob = mob;
                }
            }
        }

        if (!isAoE && closestMob) {
            closestMob.hp -= totalDamage;
            targetsHit = 1;
            if (closestMob.hp > 0 && !closestMob.targetId) closestMob.targetId = player.id;
            
            // --- YENİ DEBUFF UYGULAMA ALANI (Aktif Tek Hedef) ---
            const now = Date.now();
            const debuffDuration = (skillLevel * 1000) + 5000; 
            const debuffEndTime = now + debuffDuration;
            
            // a) Zehirli Bulut (DOT)
            if (skillId === "ninja_1_4") {
                 // Zehir hasarı: Toplam hasarın %10'u
                 const dotDamage = Math.max(10, Math.floor(totalDamage * 0.10)); 
                 
                 closestMob.activeDebuffs = closestMob.activeDebuffs || {};
                 closestMob.activeDebuffs['poison'] = {
                     endTime: debuffEndTime,
                     dotDamage: dotDamage,
                     lastTick: now, 
                     tickInterval: 1000 
                 };
            }
            
            // NOT: Sura Dehşet (sura_1_3) 'buff' türündedir ve aşağıdaki buff bloğunda işlenmelidir.
            // Bu kısım sadece aktif hasar becerilerini ilgilendirir.
            
            // --- DEBUFF UYGULAMA ALANI SONU ---
            
            if (closestMob.hp <= 0) {
                closestMob.isAlive = false;
                giveExp(player, closestMob.exp);
                 // ... (drop mantığı) ...
            }
        }
        if (targetsHit > 0) console.log(`Beceri ${targetsHit} hedefi vurdu.`);
        
    } else if (skillData.type === "heal") {
        const healAmount = (magicalBase * 1.5) + (skillLevelBonus * 2);
        player.hp = Math.min(player.maxHp, player.hp + healAmount);
        console.log(`${player.name}, ${skillData.name} kullandı ve ${Math.floor(healAmount)} HP yeniledi.`);
        
    // --- BURASI KRİTİK BUFF/DEBUFF ALANI ---
    } else if (skillData.type === "buff") {
        const duration = (skillData.duration || 10000) + (skillLevel * 1000); 
        const endTime = Date.now() + duration;

        // Buff'ı oyuncunun aktif listesine ekle
        player.activeBuffs[skillId] = endTime;

        console.log(`${player.name}, ${skillData.name} (Buff) ${duration/1000} saniyeliğine etkinleştirdi.`);
        
        // KRİTİK: Dehşet (Debuff, ancak oyuncunun buff listesinde tutulur)
        if (skillId === "sura_1_3") {
            const debuffDuration = (skillData.duration || 10000) + (skillLevel * 1000);
            const debuffEndTime = Date.now() + debuffDuration;
            
            // Dehşet Statü Azaltma: Seviye başına %0.5, Max %10
            const reductionPercent = Math.min(0.10, skillLevel * 0.005);
            
            // Mob'a uygulama (Çevredeki tüm moblara Dehşet uygula)
            for (const mobId in mobs) {
                const mob = mobs[mobId];
                if (mob.map !== player.map || !mob.isAlive) continue;
                const dist = distance(player, mob);
                
                // Oyuncu mob'a yeterince yakınsa
                if (dist < 200) { 
                    mob.activeDebuffs = mob.activeDebuffs || {};
                    mob.activeDebuffs['fear'] = {
                        endTime: debuffEndTime,
                        reductionPercent: reductionPercent,
                        originalDmg: mob.dmg, 
                        originalDef: mob.def
                    };
                    // Statüleri hemen düşür
                    mob.dmg = Math.floor(mob.originalDmg * (1 - reductionPercent));
                    mob.def = Math.floor(mob.originalDef * (1 - reductionPercent));
                    console.log(`Mob ${mob.type} dehşete kapıldı. DMG: ${mob.dmg}`);
                }
            }
        }
        
        // Buff'ın statüleri anında değiştirmesi için yeniden hesapla
        recalculatePlayerStats(player);
    }
    // --- BURASI KRİTİK BUFF/DEBUFF ALANI SONU ---

    // 8. Client'a onayı ve bekleme süresini gönder
    socket.emit("skillUsed", { 
        skillId: skillId, 
        slotIndex: slotIndex, 
        cooldown: cooldownDuration
    });
});

  // YENİ: STATÜ PUANI HARCAMA EVENTİ
  socket.on("spendStatPoint", (statType) => {
    const player = players[socket.id];
    if (!player || !player.isAlive) return;

    // 1. Puanı var mı?
    if (player.statPoints <= 0) {
        socket.emit("showNotification", { title: "Hata", message: "Yeterli statü puanın yok." });
        return;
    }
    
    // 2. Geçerli bir statü mü? (vit, str, int, dex)
    if (player.stats[statType] === undefined) {
        console.warn(`Oyuncu ${player.name} geçersiz statü (${statType}) yükseltmeye çalıştı.`);
        return;
    }
    
    // (Opsiyonel: Metin2'de 90 stat sınırı vardı)
    if (player.stats[statType] >= 90) {
        socket.emit("showNotification", { title: "Hata", message: "Bu statü zaten maksimum seviyede (90)." });
        return;
    }

    // --- Başarılı: Puanı harca ve statüyü yükselt ---
    player.statPoints--;
    player.stats[statType]++;
    
    console.log(`${player.name}, ${statType} statüsünü ${player.stats[statType]} seviyesine yükseltti.`);

    // Statü artışının etkilerini (HP, Def, Dmg) yeniden hesapla
    recalculatePlayerStats(player);
    
    // Client'a güncelleme göndermeye GEREK YOK,
    // ana 'serverGameLoop' zaten 50ms'de bir güncel 'players' objesini yolluyor.
  });

  // --- GÜNCELLENDİ: EŞYA SATIN ALMA EVENTİ ---
  socket.on("buyItem", ({ itemId, quantity }) => {
      const player = players[socket.id];
      const itemData = ITEM_DB[itemId];

      if (!player || !itemData) return;
      if (!SHOP_DB["v_merchant"] || !SHOP_DB["v_merchant"].find(s => s.itemId === itemId)) {
          socket.emit("showNotification", { title: "Hata", message: "Bu eşya satılık değil." });
          return;
      }
      
      const actualQuantity = itemData.stackSize || quantity; 
      const totalCost = itemData.buyPrice * quantity; 

      if (player.yang < totalCost) {
          socket.emit("showNotification", { title: "Hata", message: "Yeterli Yang'ın yok." });
          return;
      }

      // --- YENİ SATIN ALMA MANTIĞI ---

      // 1. Alınan yığın itemi, gerçek (base) iteme çevir
      let baseItemId = itemData.id;
      let finalQuantity = actualQuantity;
      
      if (itemData.id > 9100 && itemData.id < 9110) { // Kırmızı yığın
          baseItemId = 9001; 
      } else if (itemData.id > 9110) { // Mavi yığın
          baseItemId = 9011;
      }
      
      const finalItemTemplate = ITEM_DB[baseItemId];
      if (!finalItemTemplate) return; // Güvenlik kontrolü

      // 2. Sunucuda envantere eklemeyi dene
      let itemAdded = false;
      let quantityLeftToAdd = finalQuantity;

      // 2a. Mevcut yığınları doldur
      for (let i = 0; i < player.inventory.length; i++) {
          if (quantityLeftToAdd <= 0) break;
          const slot = player.inventory[i];
          if (slot && slot.id === baseItemId && slot.quantity < 200) {
              const spaceLeft = 200 - slot.quantity;
              const amountToAdd = Math.min(quantityLeftToAdd, spaceLeft);
              slot.quantity += amountToAdd;
              quantityLeftToAdd -= amountToAdd;
              itemAdded = true;
          }
      }

      // 2b. Kalanı boş slotlara ekle
      while (quantityLeftToAdd > 0) {
          const index = player.inventory.findIndex(slot => slot === null);
          if (index > -1) {
              const amountToAdd = Math.min(quantityLeftToAdd, 200); // Bir slota max 200
              player.inventory[index] = { ...finalItemTemplate, quantity: amountToAdd };
              quantityLeftToAdd -= amountToAdd;
              itemAdded = true; 
          } else {
              // Envanter doldu
              socket.emit("showNotification", { title: "Hata", message: "Envanter dolu, eşyanın bir kısmı veya tamamı alınamadı." });
              quantityLeftToAdd = 0; // Döngüyü kır
          }
      }

      // 3. Ekleme başarılı olduysa Yang'ı düş ve bildir
      if (itemAdded) {
          player.yang -= totalCost; // Parayı SADECE item eklenebildiyse düş
          
          // socket.emit("itemDrop", { item: itemToDrop }); // <-- ESKİ KOD SİLİNDİ

          socket.emit("showNotification", { 
              title: "Satın Alındı", 
              message: `${itemData.name} (x${actualQuantity}) için ${totalCost.toLocaleString()} Yang harcadın.` 
          });
      } else {
          // Hiç yer yoksa (yukarıdaki 2b'de zaten hata gönderildi ama bu ek bir kontrol)
           socket.emit("showNotification", { title: "Hata", message: "Envanter dolu, eşya alınamadı." });
      }
  });

  // --- YENİ EKLENDİ: EŞYA SATMA EVENTİ ---
  socket.on("sellItem", ({ itemId, inventoryIndex }) => {
      const player = players[socket.id];
      const itemData = ITEM_DB[itemId];
      const itemInSlot = player.inventory[inventoryIndex]; // Slot'taki gerçek item

      if (!player || !itemData || !itemData.sellPrice) return;
      
      // KRİTİK KONTROL: Satılmak istenen item, slotta beklenen item mi? (Güvenlik)
      if (!itemInSlot || itemInSlot.id !== itemId) {
          // Eğer slot boşsa veya itemler uyuşmuyorsa
          return socket.emit("showNotification", { title: "Hata", message: "Satılmak istenen eşya envanterde bulunamadı." });
      }

      // Potlar için miktar kontrolü
      const quantity = itemInSlot.quantity || 1;
      const totalSellPrice = itemData.sellPrice * quantity; // Miktara göre toplam fiyat

      // 1. Yang'ı ekle
      player.yang += totalSellPrice;

      // 2. KRİTİK: Sunucu envanterinden sil
      player.inventory[inventoryIndex] = null; // Eşyayı kalıcı olarak sil

      // 3. Client'a envanterden silmesi için sinyal gönder
      socket.emit("itemSold", { 
          inventoryIndex: inventoryIndex
      });

      socket.emit("showNotification", { 
          title: "Satıldı", 
          message: `**${itemData.name}** (x${quantity}) eşyasını ${totalSellPrice.toLocaleString()} Yang karşılığında sattın.` 
      });
      
      // Oyuncunun statüleri değişmediği için recalculate ve savePlayer çağırmaya gerek yok.
  });

  
  // --- GÜNCELLENDİ: TÜKETİLEBİLİR KULLANIM EVENTİ ---

  socket.on("useConsumable", ({ itemId, inventoryIndex }) => {
    const player = players[socket.id];
    const itemData = ITEM_DB[itemId];
    const now = Date.now();
    
    if (!player || !itemData || itemData.type !== 'consumable') return;

    // COOLDOWN KONTROLÜ
    if (player.lastPotUsed && now - player.lastPotUsed < POT_COOLDOWN_MS) {
        socket.emit("skillError", { message: "Pot henüz kullanıma hazır değil. Bekle: " + ((POT_COOLDOWN_MS - (now - player.lastPotUsed)) / 1000).toFixed(1) + "s" });
        return;
    }

    let success = false;
    
    // HP/MP Dolu Kontrolü
    const hpFull = player.hp >= player.maxHp;
    const mpFull = player.mp >= player.maxMp;
    
    if ( (itemData.restoreHp && hpFull) && (itemData.restoreMp && mpFull) ) {
        socket.emit("skillError", { message: "Canın ve Manan zaten dolu." });
        return;
    }
    if (itemData.restoreHp && hpFull) {
        socket.emit("skillError", { message: "Canın zaten dolu." });
        return;
    }
    if (itemData.restoreMp && mpFull) {
        socket.emit("skillError", { message: "Manan zaten dolu." });
        return;
    }

    // Yenileme
    if (itemData.restoreHp) {
        player.hp = Math.min(player.maxHp, player.hp + itemData.restoreHp);
        success = true;
    }
    
    if (itemData.restoreMp) {
        player.mp = Math.min(player.maxMp, player.mp + itemData.restoreMp);
        success = true;
    }

    if (success) {
        // Cooldown'ı başlat
        player.lastPotUsed = now; 
        
        // Client'a potun kullanıldığını ve cooldown süresini bildir
        socket.emit("potUsedCooldown", { cooldown: POT_COOLDOWN_MS });
        
        // =================================================================
        // ### YENİ EKLENEN GÜNCELLEME ###
        // Sunucu tarafında envanteri anında güncelle
        // =================================================================
        const itemInSlot = player.inventory[inventoryIndex];
        if (itemInSlot && itemInSlot.id === itemId) { // İkili kontrol
            if (itemInSlot.quantity > 1) {
                itemInSlot.quantity--; // Miktarı azalt
            } else {
                player.inventory[inventoryIndex] = null; // Slotu boşalt
            }
        }
        // =================================================================
        
        // Envanterden düşme onayı (client'ın action bar'ını temizlemesi için)
        socket.emit("consumableUsed", { inventoryIndex: inventoryIndex });
        
        socket.emit("showNotification", {
            title: "Pot Kullanıldı",
            message: `**${itemData.name}** kullanıldı. HP/MP yenilendi.`
        });
    }
  });

  // --- YENİ EKLENDİ (SOHBET) ---
  // --- GÜNCELLENDİ: TÜM SOHBET MANTIKLARI ---
  socket.on("sendChatMessage", (data) => {
      const player = players[socket.id];
      if (!player) return;

      const message = data.message.trim();
      if (message.length === 0 || message.length > 100) {
          return;
      }

      // 1. /w (WHISPER) MANTIĞI
      if (message.startsWith("/w ") || message.startsWith("/W ")) {
          const parts = message.split(" ");
          if (parts.length < 3) {
              socket.emit("newChatMessage", {
                  type: 'error',
                  message: `Kullanım: /w <OyuncuAdı> <Mesajınız>`
              });
              return;
          }

          const targetName = parts[1];
          const whisperMessage = parts.slice(2).join(" ");

          const targetPlayer = Object.values(players).find(
              p => p.name.toLowerCase() === targetName.toLowerCase()
          );

          if (!targetPlayer) {
              socket.emit("newChatMessage", {
                  type: 'error',
                  message: `Oyuncu '${targetName}' bulunamadı veya çevrimdışı.`
              });
              return;
          }
          
          if (targetPlayer.id === player.id) {
               socket.emit("newChatMessage", {
                  type: 'error',
                  message: `Kendinize fısıltı gönderemezsiniz.`
              });
              return;
          }

          console.log(`[Fısıltı] ${player.name} -> ${targetPlayer.name}: ${whisperMessage}`);
          
          io.to(targetPlayer.id).emit("newChatMessage", {
              type: 'whisper_received',
              sender: player.name,
              message: whisperMessage
          });
          
          socket.emit("newChatMessage", {
              type: 'whisper_sent',
              target: targetPlayer.name,
              message: whisperMessage
          });

      // 2. /p (PARTY CHAT) MANTIĞI (YENİ EKLENDİ)
      } else if (message.startsWith("/p ") || message.startsWith("/P ")) {
          if (!player.partyId || !parties[player.partyId]) {
               socket.emit("newChatMessage", {
                  type: 'error',
                  message: `Parti sohbeti için bir partide olmalısın. (Komut: /p <Mesajınız>)`
              });
              return;
          }

          const partyMessage = message.substring(3).trim(); // "/p " kısmını atla
          if (partyMessage.length === 0) return;

          const party = parties[player.partyId];
          console.log(`[Parti Sohbeti] ${player.name}: ${partyMessage}`);
          
          // Partideki tüm üyelere gönder
          party.members.forEach(memberId => {
              io.to(memberId).emit("newChatMessage", {
                  type: 'party',
                  sender: player.name,
                  message: partyMessage
              });
          });

      } else {

        if (message.startsWith("/")) {
        const command = message.substring(1).trim(); // '/' işaretini kaldır

        // Admin olup olmadığını kontrol et
        const accountInfo = playerToAccountMap[socket.id];
        const isAdmin = accountInfo && ADMIN_ACCOUNTS.includes(accountInfo.username);

        if (isAdmin) {
            const result = handleAdminCommand(player, command);
            // Sonucu sadece adminin kendisine gönder
            socket.emit("newChatMessage", result); 
            return; 
        } else {
            // Admin olmayan bir oyuncu komut kullanmaya çalıştı
            socket.emit("newChatMessage", {
                type: 'error',
                message: `Bilinmeyen komut: /${command}. Sadece Adminler komut kullanabilir.`
            });
            return;
        }
    }

          // 3. GENEL SOHBET MANTIĞI
          console.log(`[Genel Sohbet] ${player.name}: ${message}`);
          io.emit("newChatMessage", {
              type: 'general',
              sender: player.name,
              message: message
          });
      }
  });

  socket.on("attemptUpgrade", ({ inventoryIndex }) => {
      const player = players[socket.id];
      if (!player) return;

      const item = player.inventory[inventoryIndex];
      
      // 1. Doğrulama: Eşya var mı?
      if (!item) {
          return socket.emit("upgradeResult", { success: false, message: "Eşya bulunamadı." });
      }
      
      // 2. Doğrulama: Eşya tipi uygun mu?
      const itemType = item.type;
      if (itemType !== 'weapon' && itemType !== 'armor' && itemType !== 'helmet' && itemType !== 'shield') {
          return socket.emit("upgradeResult", { success: false, message: "Sadece Silah, Zırh, Kask ve Kalkanlar yükseltilebilir." });
      }

      // 3. Doğrulama: Maksimum seviyede mi?
      const currentPlus = item.plus || 0;
      if (currentPlus >= 9) {
          return socket.emit("upgradeResult", { success: false, message: "Bu eşya zaten +9." });
      }

      // 4. Doğrulama: Yeterli Yang var mı?
      const upgradeInfo = UPGRADE_DATA[currentPlus];
      if (player.yang < upgradeInfo.cost) {
          return socket.emit("upgradeResult", { success: false, message: `Yeterli Yang yok. Gerekli: ${upgradeInfo.cost.toLocaleString()} Yang` });
      }

      // 5. Parayı Çek
      player.yang -= upgradeInfo.cost;

      // 6. Zarı At (Başarı Şansı Kontrolü)
      if (Math.random() < upgradeInfo.successRate) {
          
          // === BAŞARILI ===
          item.plus = currentPlus + 1;
          
          // Eşyanın adını güncelle (örn: "Kılıç" -> "Kılıç +1")
          // split(' +')[0] sayesinde "Kılıç +8" -> "Kılıç" -> "Kılıç +9" olur.
          item.name = `${item.name.split(' +')[0]} +${item.plus}`;

          // İstatistikleri uygula
          if (itemType === 'weapon') {
              item.dmg = (item.dmg || 0) + upgradeInfo.weaponDmg;
          } else { // armor, helmet, shield
              item.def = (item.def || 0) + upgradeInfo.armorDef;
          }
          
          // Client'a başarılı sonucu ve güncellenmiş eşyayı gönder
          socket.emit("upgradeResult", {
              success: true,
              message: `Başarılı! Eşyan ${item.name} seviyesine yükseldi.`,
              item: item, // Güncellenmiş eşya objesi
              inventoryIndex: inventoryIndex
          });

      } else {
          
          // === BAŞARISIZ ===
          player.inventory[inventoryIndex] = null; // Eşya yok oldu
          
          // Client'a başarısız sonucu gönder
          socket.emit("upgradeResult", {
              success: false,
              isDestroyed: true,
              message: `Başarısız... ${item.name.split(' +')[0]} yok oldu.`,
              inventoryIndex: inventoryIndex
          });
      }
  });

  socket.on("registerAttempt", async ({ username, password }) => {
    // MongoDB kontrolü
    const existingAccount = await AccountModel.findOne({ username });
    if (existingAccount) {
        socket.emit("loginFail", "Bu kullanıcı adı zaten alınmış.");
        return;
    }

    // const hashedPassword = await hashPassword(password); // Eğer bcrypt kullanıyorsanız
    const hashedPassword = hashPassword(password); // Basit şifre (güvensiz)

    try {
        await AccountModel.create({ 
            username: username,
            password: hashedPassword,
            characters: []
        });
        socket.emit("registerSuccess");
    } catch (error) {
        console.error("Kayıt Hatası:", error);
        socket.emit("loginFail", "Sunucu hatası nedeniyle kayıt başarısız.");
    }
});

  socket.on("inviteToParty", (targetPlayerId) => {
      const inviter = players[socket.id];
      const target = players[targetPlayerId];

      if (!inviter || !target) return;
      if (target.partyId) {
          socket.emit("showNotification", { title: "Hata", message: `${target.name} zaten bir partide.` });
          return;
      }
      if (inviter.partyId) {
          const party = parties[inviter.partyId];
          if (party && party.leader !== inviter.id) {
              socket.emit("showNotification", { title: "Hata", message: "Sadece parti lideri davet gönderebilir." });
              return;
          }
      }

      // Hedef oyuncuya davet gönder
      io.to(targetPlayerId).emit("partyInviteReceived", {
          inviterId: inviter.id,
          inviterName: inviter.name
      });

      socket.emit("showNotification", { title: "Davet", message: `${target.name} partiye davet edildi.` });
  });

  socket.on("acceptPartyInvite", (data) => {
      const invitedPlayer = players[socket.id]; // Daveti kabul eden (kendisi)
      const inviter = players[data.inviterId]; // Daveti gönderen

      if (!invitedPlayer || !inviter || invitedPlayer.partyId) return;

      let party;
      let partyId = inviter.partyId;

      if (partyId && parties[partyId]) {
          // 1. Davet eden zaten bir partideyse, o partiye katıl
          party = parties[partyId];
          party.members.push(invitedPlayer.id);
      } else {
          // 2. Yeni parti kur
          partyId = uuidv4();
          party = {
              id: partyId,
              leader: inviter.id,
              members: [inviter.id, invitedPlayer.id]
          };
          parties[partyId] = party;
          inviter.partyId = partyId; // Davet edenin de parti ID'sini ayarla
      }

      invitedPlayer.partyId = partyId; // Davet edilenin parti ID'sini ayarla
      
      // Partideki herkese (yeni üye dahil) güncelleme gönder
      sendPartyUpdate(partyId);
  });

  socket.on("declinePartyInvite", (data) => {
      const target = players[data.inviterId];
      if (target) {
          io.to(data.inviterId).emit("showNotification", {
              title: "Parti",
              message: `${players[socket.id]?.name || 'Oyuncu'} davetinizi reddetti.`
          });
      }
  });

  socket.on("leaveParty", () => {
      const player = players[socket.id];
      if (!player || !player.partyId) return;

      const partyId = player.partyId;
      const party = parties[partyId];
      if (!party) return;

      // Oyuncuyu partiden çıkar
      party.members = party.members.filter(id => id !== player.id);
      player.partyId = null;

      // Ayrılan oyuncuya UI'ı temizlemesi için null gönder
      socket.emit("partyDataUpdate", null);

      if (party.members.length <= 1) {
          // Partide 1 kişi kaldıysa (veya 0), partiyi dağıt
          if (party.members.length === 1) {
              const lastMember = players[party.members[0]];
              if (lastMember) {
                  lastMember.partyId = null;
                  io.to(lastMember.id).emit("partyDataUpdate", null);
              }
          }
          delete parties[partyId];
          console.log(`Parti ${partyId} dağıtıldı.`);
      } else if (party.leader === player.id) {
          // Lider ayrıldıysa, yeni bir lider ata
          party.leader = party.members[0];
          sendPartyUpdate(partyId);
      } else {
          // Normal üye ayrıldıysa, kalanlara güncelle
          sendPartyUpdate(partyId);
      }
  });

  socket.on("kickFromParty", (targetPlayerId) => {
      const leader = players[socket.id];
      const target = players[targetPlayerId];
      if (!leader || !target || !leader.partyId) return;

      const party = parties[leader.partyId];
      if (!party || party.leader !== leader.id) {
          socket.emit("showNotification", { title: "Hata", message: "Oyuncu atma yetkiniz yok." });
          return;
      }
      if (leader.id === target.id) return; // Kendini atamaz

      // Hedefi partiden çıkar
      party.members = party.members.filter(id => id !== target.id);
      target.partyId = null;

      // Atılan oyuncuya UI'ı temizlemesi için null gönder
      io.to(target.id).emit("partyDataUpdate", null);
      io.to(target.id).emit("showNotification", { title: "Parti", message: "Partiden atıldın." });

      // Partidekilere güncelleme gönder
      sendPartyUpdate(party.id);
  });

// YENİ EVENT: Giriş Yapma
// YENİ EVENT: Giriş Yapma (async yap)
socket.on("loginAttempt", async ({ username, password }) => {
    // MongoDB'den hesabı bul
    const account = await AccountModel.findOne({ username }).lean();
    if (!account) {
        socket.emit("loginFail", "Kullanıcı adı veya şifre yanlış.");
        return;
    }

    // Şifre kontrolü
    const match = comparePassword(password, account.password); 

    if (match) {
        // Başarılı giriş: socket ID'sine hesabı ata
        playerToAccountMap[socket.id] = { username: username, characters: account.characters };
        
        // --- KRİTİK DÜZELTME: KARAKTER DETAYLARINI ÇEKME BAŞLANGICI ---
        const detailedCharacters = [];
        for (const charName of account.characters) {
            // Sadece sınıf, seviye ve adı çek
            const playerData = await PlayerModel.findOne({ name: charName }).select('name class level').lean();
            
            // Hata önleme: Verinin varlığını kontrol et
            if (playerData && playerData.class && playerData.level !== undefined) { 
                detailedCharacters.push({
                    name: playerData.name,
                    class: playerData.class,
                    level: playerData.level
                });
            } else {
                 console.warn(`Karakter verisi eksik (Sınıf/Seviye): ${charName}. MongoDB kaydını kontrol edin.`);
            }
        }
        
        // KRİTİK: Detaylı listeyi gönder
        socket.emit("loginSuccess", { characters: detailedCharacters });
        
    } else {
        socket.emit("loginFail", "Kullanıcı adı veya şifre yanlış.");
    }
});

// YENİ EVENT: Karakter Oluşturma/Giriş Yapma
socket.on("createOrJoinCharacter", async (characterChoices) => { 
    const accountInfo = playerToAccountMap[socket.id];
    if (!accountInfo) {
         console.log("HATA: Hesap bilgisi yok.");
         return; 
    }
    console.log(`Giriş/Oluşturma Denemesi: ${characterChoices.name}`);

    const charName = characterChoices.name;
    
    // 1. MongoDB'den hesabı çek (güncelleme yapacağımız için .lean() kullanmıyoruz)
    const account = await AccountModel.findOne({ username: accountInfo.username });
    if (!account) return; 

    // 2. Zaten mevcut karakter mi? (Giriş Yapma)
    if (account.characters.includes(charName)) {
        const alreadyOnline = Object.values(players).some(p => p.name === charName);
        if (alreadyOnline) {
             socket.emit("loginFail", "Bu karakter zaten oyunda.");
             return;
        }

        // Var olan karakteri yükle.
        const player = await createPlayer(socket, { name: charName }); 
        
        playerToAccountMap[socket.id].characterName = charName; 
        
        // KRİTİK: Yüklendikten sonra oyuncu listesine ekle
        players[socket.id] = player; 
        
        socket.emit("characterJoined");
        return;
    }

    // 3. Yeni Karakter Oluşturma Kontrolü
    
    // A. Slot kontrolü
    if (account.characters.length >= MAX_CHARACTERS_PER_ACCOUNT) {
         socket.emit("characterCreationFail", `Maksimum karakter sayısına (${MAX_CHARACTERS_PER_ACCOUNT}) ulaştınız.`);
         return;
    }
    
    // B. İsim kontrolü (Global olarak PlayerModel'de var mı?)
    const existingPlayerData = await loadPlayer(charName); 
    if (existingPlayerData) {
        socket.emit("characterCreationFail", "Bu karakter adı zaten alınmış.");
        return;
    }

    // 4. Yeni Karakter Başarılı Şekilde Oluşturuldu
    const player = await createPlayer(socket, characterChoices); 

    // Hesabın karakter listesine ekle ve kaydet
    account.characters.push(charName);
    await account.save(); 

    // playerToAccountMap'i güncelle
    playerToAccountMap[socket.id].characterName = charName; 

    // KRİTİK: Oyuncuyu aktif listeye ekle
    players[socket.id] = player;

    socket.emit("characterJoined");
});

// createPlayer fonksiyonunu güncelleyin: Artık SADECE data.name'e göre yükleme yapacak.
// Zaten oyuncu varsa yükleyecek, yoksa sıfırdan oluşturacak (Yukarıdaki 3. adımda kontrol edildi)


/**
 * Bir oyuncunun envanterindeki boş slot sayısını döndürür.
 */
function getEmptyInventorySlots(player) {
    return player.inventory.filter(slot => slot === null).length;
}

/**
 * Verilen eşya listesini oyuncunun envanterine ekler.
 * (Potları birleştirir, diğerlerini boş slotlara koyar)
 * @returns {boolean} - Tüm eşyalar sığdıysa true, sığmadıysa false.
 */
function addItemsToInventory(player, itemsToAdd) {
    let allAdded = true;
    for (const item of itemsToAdd) {
        if (!item) continue;
        
        let itemAdded = false;
        
        // Tüketilebilirse yığınla
        if (item.type === 'consumable' && item.quantity) {
            for (let i = 0; i < player.inventory.length; i++) {
                const slot = player.inventory[i];
                if (slot && slot.id === item.id && (slot.quantity || 0) < 200) {
                    const spaceLeft = 200 - (slot.quantity || 0);
                    const amountToAdd = Math.min(item.quantity, spaceLeft);
                    slot.quantity += amountToAdd;
                    item.quantity -= amountToAdd;
                    if (item.quantity <= 0) {
                        itemAdded = true;
                        break;
                    }
                }
            }
        }

        // Kalanı (veya yığınlanamayanı) boş slota koy
        if (item.quantity === undefined || item.quantity > 0) {
            const emptyIndex = player.inventory.findIndex(slot => slot === null);
            if (emptyIndex !== -1) {
                player.inventory[emptyIndex] = item;
                itemAdded = true;
            }
        }
        
        if (!itemAdded) {
            allAdded = false;
            // TODO: Eşya yere düşebilir (şimdilik kayboluyor)
            console.error(`HATA: ${player.name} envanteri dolu, ${item.name} eklenemedi!`);
        }
    }
    return allAdded;
}

/**
 * Aktif bir ticareti sonlandırır ve her iki tarafa da haber verir.
 */
function cancelTrade(tradeId, notifyMessage) {
    const trade = activeTrades[tradeId];
    if (!trade) return;

    const playerA = players[trade.playerA_id];
    const playerB = players[trade.playerB_id];

    if (playerA) {
        playerA.tradeId = null;
        // KRİTİK: A tarafına İptal Sinyali Gönder
        io.to(playerA.id).emit("tradeCancelled", { message: notifyMessage });
    }
    if (playerB) {
        playerB.tradeId = null;
        // KRİTİK: B tarafına İptal Sinyali Gönder
        io.to(playerB.id).emit("tradeCancelled", { message: notifyMessage });
    }
    
    delete activeTrades[tradeId];
    console.log(`Ticaret ${tradeId} iptal edildi: ${notifyMessage}`);
}
/**
 * Ticareti onaylar ve eşya/yang transferini gerçekleştirir.
 */
async function executeTrade(tradeId) {
    try {
        const trade = activeTrades[tradeId];
        if (!trade || !trade.playerA_locked || !trade.playerB_locked) {
            return cancelTrade(tradeId, "Onay hatası nedeniyle ticaret iptal edildi.");
        }
    
        const playerA = players[trade.playerA_id];
        const playerB = players[trade.playerB_id];

        if (!playerA || !playerB) {
            return cancelTrade(tradeId, "Oyunculardan biri çevrimdışı.");
        }

        // --- 1. SON DOĞRULAMA ---
        
        // Yang Kontrolü
        if (playerA.yang < trade.playerA_offer.yang || playerB.yang < trade.playerB_offer.yang) {
            return cancelTrade(tradeId, "Yetersiz Yang nedeniyle ticaret iptal edildi.");
        }
        
        // Eşya Varlığı Kontrolü 
        const itemsA = [];
        for (const offer of trade.playerA_offer.items) {
            const item = playerA.inventory[offer.invIndex];
            if (!item || item.id !== offer.item.id) {
                 return cancelTrade(tradeId, `Ticaret hatası (A Tarafı): ${offer.item.name} envanterde bulunamadı.`);
            }
            itemsA.push(item);
        }
        
        const itemsB = [];
        for (const offer of trade.playerB_offer.items) {
            const item = playerB.inventory[offer.invIndex];
            if (!item || item.id !== offer.item.id) {
                 return cancelTrade(tradeId, `Ticaret hatası (B Tarafı): ${offer.item.name} envanterde bulunamadı.`);
            }
            itemsB.push(item);
        }
        
        // Envanter Yeri Kontrolü
        const slotsA_needed = itemsB.length;
        const slotsB_needed = itemsA.length;
        const slotsA_available = getEmptyInventorySlots(playerA) + itemsA.length;
        const slotsB_available = getEmptyInventorySlots(playerB) + itemsB.length;

        if (slotsA_available < slotsA_needed) {
            io.to(playerA.id).emit("showNotification", { title: "Ticaret Başarısız", message: "Envanterinizde yeterli boş yer yok." });
            io.to(playerB.id).emit("showNotification", { title: "Ticaret Başarısız", message: "Karşı tarafın envanterinde yeterli boş yer yok." });
            return cancelTrade(tradeId, "Yetersiz envanter yeri (A).");
        }
        if (slotsB_available < slotsB_needed) {
             io.to(playerB.id).emit("showNotification", { title: "Ticaret Başarısız", message: "Envanterinizde yeterli boş yer yok." });
            io.to(playerA.id).emit("showNotification", { title: "Ticaret Başarısız", message: "Karşı tarafın envanterinde yeterli boş yer yok." });
            return cancelTrade(tradeId, "Yetersiz envanter yeri (B).");
        }

        // --- 2. TRANSFER ---
        
        // Yang Transferi
        playerA.yang -= trade.playerA_offer.yang;
        playerA.yang += trade.playerB_offer.yang;
        playerB.yang -= trade.playerB_offer.yang;
        playerB.yang += trade.playerA_offer.yang;
        
        // Eşya Slotlarını Boşaltma
        trade.playerA_offer.items.forEach(offer => playerA.inventory[offer.invIndex] = null);
        trade.playerB_offer.items.forEach(offer => playerB.inventory[offer.invIndex] = null);
        
        // Eşyaları Yeni Sahiplerine Ekleme
        addItemsToInventory(playerA, itemsB);
        addItemsToInventory(playerB, itemsA);

        // --- 3. BİTİŞ VE KRİTİK SİNYALLER (GÜNCELLENEN KISIM) ---
        console.log(`Ticaret ${tradeId} başarıyla tamamlandı. Sinyaller gönderiliyor.`);
        
        // KRİTİK SİNYALLER: Güncel Envanter ve Yang'ı GÖNDER
        
        // Player A'ya sinyal
        io.to(playerA.id).emit("tradeSuccess", { 
            message: "Ticaret başarıyla tamamlandı!",
            // MongoDB'den sonra güncellenen Player objesinin son durumunu yolla
            inventory: playerA.inventory, 
            yang: playerA.yang            
        });

        // Player B'ye sinyal
        io.to(playerB.id).emit("tradeSuccess", { 
            message: "Ticaret başarıyla tamamlandı!",
            // MongoDB'den sonra güncellenen Player objesinin son durumunu yolla
            inventory: playerB.inventory, 
            yang: playerB.yang            
        });
        
        // --- 4. TİCARET OTURUMUNU TEMİZLE ---
        
        // Oyuncuları asenkron kaydet (await gerekli)
        await savePlayer(playerA); // <<< ASENKRON KAYIT
        await savePlayer(playerB); // <<< ASENKRON KAYIT
        
        // Oturumu temizle
        playerA.tradeId = null;
        playerB.tradeId = null;
        delete activeTrades[tradeId];
        
        return;
        
    } catch (error) {
        console.error("!!! Ticaret YÜRÜTÜLÜRKEN KRİTİK HATA:", error);
        cancelTrade(tradeId, "Bilinmeyen bir sunucu hatası nedeniyle ticaret iptal edildi.");
    }
}



// --- Socket Dinleyicileri ---

socket.on("requestTrade", (targetPlayerId) => {
    const requester = players[socket.id];
    const target = players[targetPlayerId];

    if (!requester || !target) return;
    if (requester.tradeId || target.tradeId) {
        return socket.emit("showNotification", { title: "Hata", message: "Oyunculardan biri zaten bir ticaret ekranında." });
    }
    if (requester.id === target.id) return;
    
    // Güvenli bölge kontrolü (opsiyonel ama önerilir)
    // const map = MAP_DATA[requester.map];
    // if (!map.safeZone || distance(requester, map.safeZone) > map.safeZone.radius) {
    //     return socket.emit("showNotification", { title: "Hata", message: "Ticaret sadece güvenli bölgelerde yapılabilir." });
    // }

    // Hedef oyuncuya davet gönder
    io.to(targetPlayerId).emit("tradeRequestReceived", {
        requesterId: requester.id,
        requesterName: requester.name
    });

    socket.emit("showNotification", { title: "Ticaret", message: `${target.name} oyuncusuna ticaret daveti gönderildi.` });
});

socket.on("declineTrade", (requesterId) => {
    const targetName = players[socket.id]?.name || "Oyuncu";
    io.to(requesterId).emit("tradeRequestDeclined", {
        message: `${targetName} ticaret davetinizi reddetti.`
    });
});

socket.on("acceptTrade", (requesterId) => {
    // Daveti kabul eden (B) oyuncusu
    const playerB = players[socket.id]; 
    // Daveti gönderen (A) oyuncusu
    const playerA = players[requesterId]; 

    if (!playerA || !playerB || playerA.tradeId || playerB.tradeId) {
        return; // Biri meşgul veya çevrimdışı
    }

    const tradeId = uuidv4();
    const tradeSession = {
        id: tradeId,
        playerA_id: playerA.id, 
        playerB_id: playerB.id, 
        playerA_offer: { items: [], yang: 0 },
        playerB_offer: { items: [], yang: 0 },
        playerA_locked: false,
        playerB_locked: false,
        playerA_confirmed: false,
        playerB_confirmed: false,
    };
    
    activeTrades[tradeId] = tradeSession;
    playerA.tradeId = tradeId;
    playerB.tradeId = tradeId;

    // Her iki oyuncuya da ticaret penceresini açtır
    
    // playerA için gönderilen data
    const tradeDataA = {
        tradeId: tradeId,
        myId: playerA.id,
        opponent: { id: playerB.id, name: playerB.name },
        myOffer: tradeSession.playerA_offer,
        opponentOffer: tradeSession.playerB_offer,
        
        // KRİTİK EKLENTİ
        playerA_id: playerA.id, 
        playerB_id: playerB.id,
        // KRİTİK EKLENTİ SONU
        
        playerA_locked: tradeSession.playerA_locked,
        playerB_locked: tradeSession.playerB_locked,
    };

    io.to(playerA.id).emit("tradeWindowOpen", tradeDataA);
    
    // playerB için gönderilen data (A ve B'nin rolleri yer değiştirir)
    const tradeDataB = {
        tradeId: tradeId,
        myId: playerB.id,
        opponent: { id: playerA.id, name: playerA.name },
        myOffer: tradeSession.playerB_offer,
        opponentOffer: tradeSession.playerA_offer,
        
        // KRİTİK EKLENTİ
        playerA_id: playerA.id, 
        playerB_id: playerB.id,
        // KRİTİK EKLENTİ SONU
        
        playerA_locked: tradeSession.playerA_locked,
        playerB_locked: tradeSession.playerB_locked,
    };
    io.to(playerB.id).emit("tradeWindowOpen", tradeDataB);
    
    console.log(`Ticaret oturumu başladı: ${tradeId} (${playerA.name} vs ${playerB.name})`);
});

socket.on("cancelTrade", () => {
    const player = players[socket.id];
    if (player && player.tradeId) {
        cancelTrade(player.tradeId, `${player.name} ticareti iptal etti.`);
    }
});

/**
 * Bir oyuncu teklifini değiştirdiğinde (item/yang) tüm onayları sıfırlar.
 */
function resetTradeLocks(trade, reason) {
    if (trade.playerA_locked || trade.playerB_locked) {
        trade.playerA_locked = false;
        trade.playerB_locked = false;
        
        // Her iki oyuncuya da kilitlerin açıldığını bildir
        const update = { playerA_locked: false, playerB_locked: false };
        io.to(trade.playerA_id).emit("tradeLockUpdate", update);
        io.to(trade.playerB_id).emit("tradeLockUpdate", update);
        
        io.to(trade.playerA_id).emit("showNotification", { title: "Ticaret", message: `Teklif değiştiği için onaylar sıfırlandı. (${reason})` });
        io.to(trade.playerB_id).emit("showNotification", { title: "Ticaret", message: `Teklif değiştiği için onaylar sıfırlandı. (${reason})` });
    }
    // Son onayları da sıfırla
    trade.playerA_confirmed = false;
    trade.playerB_confirmed = false;
}

/**
 * Güncellenmiş teklifi her iki oyuncuya da gönderir.
 */
function broadcastTradeOfferUpdate(trade) {
     io.to(trade.playerA_id).emit("tradeOfferUpdate", {
        myOffer: trade.playerA_offer,
        opponentOffer: trade.playerB_offer
    });
    io.to(trade.playerB_id).emit("tradeOfferUpdate", {
        myOffer: trade.playerB_offer,
        opponentOffer: trade.playerA_offer
    });
}

socket.on("addTradeItem", ({ tradeId, inventoryIndex }) => {
    const player = players[socket.id];
    const trade = activeTrades[tradeId];
    if (!player || !trade) return;
    if (trade.playerA_id !== player.id && trade.playerB_id !== player.id) return;
    
    const item = player.inventory[inventoryIndex];
    if (!item || item.type === 'consumable') { // Pot vb. ticareti şimdilik kapalı
         return socket.emit("showNotification", { title: "Hata", message: "Tüketilebilir eşyalar (pot) ticarete konulamaz." });
    }
    
    const offerSide = (trade.playerA_id === player.id) ? trade.playerA_offer : trade.playerB_offer;
    
    // Zaten teklifte mi?
    if (offerSide.items.some(offer => offer.invIndex === inventoryIndex)) return;
    
    // Maksimum slot (12)
    if (offerSide.items.length >= 12) {
        return socket.emit("showNotification", { title: "Hata", message: "Ticaret penceresi dolu (Maks. 12 eşya)." });
    }

    offerSide.items.push({ invIndex: inventoryIndex, item: item });
    
    resetTradeLocks(trade, "Eşya eklendi");
    broadcastTradeOfferUpdate(trade);
});

socket.on("removeTradeItem", ({ tradeId, tradeSlotIndex }) => {
    const player = players[socket.id];
    const trade = activeTrades[tradeId];
    if (!player || !trade) return;
    
    const offerSide = (trade.playerA_id === player.id) ? trade.playerA_offer : trade.playerB_offer;
    
    if (offerSide.items[tradeSlotIndex]) {
        offerSide.items.splice(tradeSlotIndex, 1); // İtemi diziden çıkar
        
        resetTradeLocks(trade, "Eşya kaldırıldı");
        broadcastTradeOfferUpdate(trade);
    }
});

socket.on("setTradeYang", ({ tradeId, amount }) => {
    const player = players[socket.id];
    const trade = activeTrades[tradeId];
    if (!player || !trade) return;
    
    const cleanAmount = Math.max(0, Math.floor(amount));
    if (cleanAmount > player.yang) {
         // Client'a hata gönder (ancak bu client-side'da da kontrol edilmeli)
         // Şimdilik sadece oyuncunun max yang'ına sabitliyoruz
         // cleanAmount = player.yang; 
         return socket.emit("showNotification", { title: "Hata", message: "Yeterli Yang'ın yok." });
    }
    
    const offerSide = (trade.playerA_id === player.id) ? trade.playerA_offer : trade.playerB_offer;
    
    if (offerSide.yang === cleanAmount) return; // Değişiklik yok
    
    offerSide.yang = cleanAmount;
    
    resetTradeLocks(trade, "Yang değiştirildi");
    broadcastTradeOfferUpdate(trade);
});

socket.on("lockTrade", ({ tradeId }) => {
    const player = players[socket.id];
    const trade = activeTrades[tradeId];
    if (!player || !trade) return;
    
    let playerKey, opponentKey;
    if (trade.playerA_id === player.id) {
        playerKey = "playerA_locked";
        opponentKey = "playerB_locked";
    } else {
        playerKey = "playerB_locked";
        opponentKey = "playerA_locked";
    }
    
    // 1. Oyuncunun kendi teklifini kilitler (İlk Kabul)
    trade[playerKey] = true;
    
    // 2. Her iki oyuncuya da yeni kilit durumunu gönder (renderTradeWindow'ı tetikler)
    const update = {
        playerA_locked: trade.playerA_locked,
        playerB_locked: trade.playerB_locked,
    };
    io.to(trade.playerA_id).emit("tradeLockUpdate", update);
    io.to(trade.playerB_id).emit("tradeLockUpdate", update);
});

// server.js

socket.on("confirmTrade", ({ tradeId }) => {
    try {
        const player = players[socket.id];
        const trade = activeTrades[tradeId];
        if (!player || !trade) return;

        // 1. Son onaydan önce her iki tarafın da KİLİTLİ olduğundan emin ol
        if (!trade.playerA_locked || !trade.playerB_locked) {
            return; // Kilitli değilken onaylayamaz
        }
        
        let playerConfirmKey;
        let opponentId; // Karşı tarafın socket ID'si

        if (trade.playerA_id === player.id) {
            playerConfirmKey = "playerA_confirmed";
            opponentId = trade.playerB_id;
        } else {
            playerConfirmKey = "playerB_confirmed";
            opponentId = trade.playerA_id;
        }

        // 2. Oyuncunun son onay durumunu kaydet
        trade[playerConfirmKey] = true;
        
        // 3. Eğer her iki taraf da son onayı verdiyse, ticareti gerçekleştir
        if (trade.playerA_confirmed && trade.playerB_confirmed) {
            executeTrade(tradeId);
        } else {
            // 4. Karşı tarafa ve onaylayana durumu bildir
            
            // Onaylayana geri bildirim
            socket.emit("tradeConfirmUpdate", {
                message: "Onaylandı. Karşı taraf bekleniyor..."
            });
            
            // Karşı tarafa bildirim (SADECE karşı tarafa)
            io.to(opponentId).emit("tradeConfirmUpdate", {
                message: "Karşı taraf son onayı verdi. Lütfen onayla."
            });
        }
    
    } catch (error) {
        console.error("!!! Ticaret ONAYLANIRKEN KRİTİK HATA:", error);
        const player = players[socket.id];
        if (player && player.tradeId) {
            cancelTrade(player.tradeId, "Onaylama sırasında bir hata oluştu, ticaret iptal edildi.");
        }
    }
});

// server.js (disconnect fonksiyonunu bulun ve güncelleyin)

  socket.on("disconnect", () => {
    const player = players[socket.id];
    
    // --- GÜNCELLEME BAŞLANGICI ---
    if (player) {
        // Oyuncu aktif bir ticaretteyse iptal et
        if (player.tradeId && activeTrades[player.tradeId]) {
            // CRITICAL: Diğer oyuncuya da sinyal gitmesi için cancelTrade çağrılıyor
            cancelTrade(player.tradeId, `${player.name} oyundan ayrıldı.`); 
        }
        
        // Oyuncu partideyken ayrılırsa (bu kod zaten vardı, kontrol et)
        if (player.partyId && parties[player.partyId]) {
            // ... (Parti ayrılma/dağıtma mantığı) ...
             const partyId = player.partyId;
             const party = parties[partyId];
             if (party) {
                party.members = party.members.filter(id => id !== player.id);
                player.partyId = null;
                if (party.members.length <= 1) {
                    if (party.members.length === 1) {
                        const lastMember = players[party.members[0]];
                        if (lastMember) {
                            lastMember.partyId = null;
                            io.to(lastMember.id).emit("partyDataUpdate", null);
                        }
                    }
                    delete parties[partyId];
                } else if (party.leader === player.id) {
                    party.leader = party.members[0];
                    sendPartyUpdate(partyId);
                } else {
                    sendPartyUpdate(partyId);
                }
             }
        }
        
        savePlayer(player); // Oyuncuyu kaydet
        delete players[socket.id]; // Oyuncuyu sil
    }
    // --- GÜNCELLEME SONU ---
    
    delete playerToAccountMap[socket.id]; // Hesap bilgisini temizle
    console.log("Bağlantı koptu:", socket.id);
});
});

function distance(a, b) {
  const dx = a.x + a.width / 2 - (b.x + b.width / 2);
  const dy = a.y + a.height / 2 - (b.y + b.height / 2);
  return Math.sqrt(dx * dx + dy * dy);
}

// --- GÜNCEL SENDPARTYUPDATE FONKSİYONU BAŞLANGICI ---
function sendPartyUpdate(partyId) {
    const party = parties[partyId];
    if (!party) return;

    const memberDetails = party.members.map(memberId => {
        const member = players[memberId];
        if (!member) return null;
        return {
            id: member.id,
            name: member.name,
            hp: member.hp,
            maxHp: member.maxHp,
            level: member.level
        };
    }).filter(Boolean);

    const partyDataToSend = {
        id: party.id,
        leader: party.leader,
        members: party.members,
        memberDetails: memberDetails
    };

    party.members.forEach(memberId => {
        if (players[memberId]) { 
            io.to(memberId).emit("partyDataUpdate", partyDataToSend);
        }
    });
}
// --- GÜNCEL SENDPARTYUPDATE FONKSİYONU SONU ---

// ---------------------- SUNUCU OYUN DÖNGÜSÜ ----------------------
function serverGameLoop() {
  const now = Date.now(); // 'now' değişkenini döngünün başına taşıdık

  // --- YENİ EKLENEN PARTİ DURUM GÜNCELLEMESİ ---
  const partyUpdateInterval = 500; // 500ms'de bir (0.5 saniye)
  if (now % partyUpdateInterval < 50) { // Her 500ms'de bir tetiklenir
      for (const partyId in parties) {
          sendPartyUpdate(partyId); // Her parti için güncel durumu yolla
      }
  }
  // --- PARTİ DURUM GÜNCELLEMESİ SONU ---

  // --- YENİ: METİN RESPAWN KONTROLÜ (1 DAKİKA) ---
    const metinsToSpawn = [];
    for (const metinId in deadMetins) {
        const deadMetin = deadMetins[metinId];
        if (now >= deadMetin.respawnTime) {
            // Respawn zamanı geldi
            metinsToSpawn.push({ id: metinId, map: deadMetin.map });
        }
    }

    metinsToSpawn.forEach(({ id, map }) => {
        // Metin yarat (Rastgele bir konumda)
        spawnMetin(map); 
        // Respawn listesinden çıkar
        delete deadMetins[id];
    });
    // --- METİN RESPAWN KONTROLÜ SONU ---

  // 1. Oyuncu Mantığı
  for (const socketId in players) {
    const player = players[socketId];
    if (!player) continue;

    // --- YENİ BÖLÜM: BUFF SÜRE KONTROLÜ ---
    let needsRecalculate = false; // Statülerin yeniden hesaplanması gerekiyor mu?
    if (player.activeBuffs) {
        for (const skillId in player.activeBuffs) {
            const endTime = player.activeBuffs[skillId];
            
            if (now > endTime) {
                // Bu buff'ın süresi doldu!
                delete player.activeBuffs[skillId];
                needsRecalculate = true; // Statülerin buff olmadan güncellenmesi lazım
                console.log(`${player.name} için ${skillId} buff'ı sona erdi.`);
            }
        }
    }
    
    // Eğer en az bir buff süresi dolduysa, statüleri yeniden hesapla
    if (needsRecalculate) {
        recalculatePlayerStats(player);
    }
    // --- YENİ BÖLÜM SONU ---


    if (!player.isAlive) { 
        player.keysPressed = { w: false, a: false, s: false, d: false }; 
        continue; 
    }

    if (!player.map) continue;
    const map = MAP_DATA[player.map];
    if (!map) continue;

    let moving = false;
    const totalSpeed = PLAYER_SPEED + player.bonusSpeed; // YENİ TOPLAM HIZ
    if (player.keysPressed["w"]) { player.y -= PLAYER_SPEED + player.bonusSpeed; player.direction = "up"; moving = true; }
    if (player.keysPressed["s"]) { player.y += PLAYER_SPEED + player.bonusSpeed; player.direction = "down"; moving = true; }
    if (player.keysPressed["a"]) { player.x -= PLAYER_SPEED + player.bonusSpeed; player.direction = "left"; moving = true; }
    if (player.keysPressed["d"]) { player.x += PLAYER_SPEED + player.bonusSpeed; player.direction = "right", moving = true; }

    if (player.x < 0) player.x = 0;
    if (player.y < 0) player.y = 0;
    if (player.x + player.width > map.width) player.x = map.width - player.width;
    if (player.y + player.height > map.height) player.y = map.height - player.height;

    // Portal geçişi
    for (const portal of map.portals) {
      if (
        player.x < portal.x + portal.width &&
        player.x + player.width > portal.x &&
        player.y < portal.y + portal.height &&
        player.y + player.height > portal.y
      ) {
        player.map = portal.targetMap;
        player.x = portal.targetX;
        player.y = portal.targetY;
      }
    }

    if (player.animState !== "slash") {
      player.animState = moving ? "walk" : "idle";
    }
  }

  // 2. Mob Mantığı (YENİ YAPAY ZEKA)
for (const mobId in mobs) {
    const mob = mobs[mobId];

    // --- YENİ: DEBUFF SÜRE VE DOT KONTROLÜ ---
    let needsRecalculate = false; 

    if (mob.activeDebuffs) {
        for (const debuffName in mob.activeDebuffs) {
            const debuff = mob.activeDebuffs[debuffName];

            // 1. Süre Doldu mu?
            if (now > debuff.endTime) {
                delete mob.activeDebuffs[debuffName];
                needsRecalculate = true; 
                console.log(`Mob ${mob.type} için ${debuffName} debuff'ı sona erdi.`);
                continue;
            }

            // 2. Zehir (DOT) Hasarı Uygula
            if (debuffName === 'poison' && now - debuff.lastTick >= debuff.tickInterval) {
                 
                // Hasarı uygula
                mob.hp -= debuff.dotDamage;
                debuff.lastTick = now; // Yeni tick zamanını ayarla
                
                // Mob öldü mü? (DOT ile ölebilir)
                if (mob.hp <= 0 && mob.isAlive) {
                    mob.isAlive = false;
                    mob.deathTime = now;
                    // Mob öldü. Buradan EXP veya Yang vermiyoruz (saldırıyı tetikleyen player yok).
                    // Mob'a son hasarı vuran oyuncuya EXP vermek isterseniz, Zehir debuff'ına 'sourcePlayerId' eklemelisiniz.
                    console.log(`Mob ${mob.type} zehirden öldü.`);
                }
            }
        }
    }

    // 3. Dehşet (Fear) Etkisini Geri Al
    if (needsRecalculate) {
        if (!mob.activeDebuffs || !mob.activeDebuffs['fear']) {
             // Dehşet kalktıysa veya hiç yoksa
             if (mob.activeDebuffs && mob.activeDebuffs['fear'] === undefined && mob.originalDmg) {
                mob.dmg = mob.originalDmg; 
                mob.def = mob.originalDef;
                delete mob.originalDmg;
                delete mob.originalDef;
             }
        }
    }
    // --- DEBUFF KONTROLÜ SONU ---

    // 2a. Ölüm/Respawn Kontrolü (GÜNCELLENDİ)
    if (!mob.isAlive) {
      // Mob ölü. Respawn zamanı geldi mi?
      const now = Date.now(); // (Bu 'now' değişkeni zaten döngünün başında tanımlı olmalı)
      
      if (now - (mob.deathTime || now) >= MOB_RESPAWN_TIME) {
        // Evet, respawn et!
        mob.hp = mob.maxHp;
        mob.isAlive = true;
        mob.x = mob.spawnX; // Orijinal spawn X'ine geri dön
        mob.y = mob.spawnY; // Orijinal spawn Y'sine geri dön
        mob.targetId = null;
        mob.deathTime = undefined; // Ölüm zamanını temizle
      } else {
        // Henüz zamanı gelmedi.
        // 'continue' KULLANMA. Client'ın ölü olduğunu, animasyon
        // oynatması gerektiğini ve deathTime'ı bilmesi için
        // mob verisini göndermeye devam etmeliyiz.
      }
    }

    // YENİ: Eğer mob hala ölü (respawn bekliyor), AI'ı çalıştırma
    if (!mob.isAlive) {
      continue;
    }
    
    // 2b. Animasyon (Eski mantığı koru)
    mob.animTicker++;
    if (mob.animTicker >= mob.idleSpeed) {
      mob.animTicker = 0;
      mob.animFrame = (mob.animFrame + 1) % 2;
    }

    // 2c. Hedef (Target) Kontrolü
    let targetPlayer = players[mob.targetId];

    if (targetPlayer && (targetPlayer.map !== mob.map || !targetPlayer.isAlive)) {
      targetPlayer = null; 
      mob.targetId = null;
    }
    
    // 2d. HEDEF YOKSA: Yeni hedef ara (Aggressive AI) veya Leash (Eve Dön)
    if (!targetPlayer) {
        
      // 1. Saldırgan moblar için hedef ara... (Bu kısım aynı kalır)
      if (mob.isAggressive) {
        let closestDist = mob.aggroRange;
        let potentialTarget = null;
        
        for (const playerId in players) {
          const player = players[playerId];
          if (player.map !== mob.map || !player.isAlive) continue; 
          
          const dist = distance(mob, player);
          if (dist < closestDist) {
            closestDist = dist;
            potentialTarget = player;
          }
        }
        
        if (potentialTarget) {
          mob.targetId = potentialTarget.id;
          targetPlayer = potentialTarget; 
        }
      }
      
      // 2. Mobun gezinme/eve dönme mantığı (Roaming)
      if (!mob.targetId) {
        const distToSpawn = Math.hypot(mob.x - mob.spawnX, mob.y - mob.spawnY);
        const maxRoamingRange = 400; // Mob, spawn noktasından en fazla 400 birim uzaklaşabilir

        // KRİTİK: Mob bekleme durumunda mı?
        if (mob.roamWaitTime && now < mob.roamWaitTime) {
            mob.animState = "idle"; // Bekliyorsa idle animasyonu
            continue; // Hareket etme kodunu atla
        }


        if (distToSpawn > maxRoamingRange) { 
          // Ana spawn noktasına geri dön (Leash)
          const angle = Math.atan2(mob.spawnY - mob.y, mob.spawnX - mob.x);
          mob.x += Math.cos(angle) * mob.moveSpeed * 0.5; // Yavaşça eve dön
          mob.y += Math.sin(angle) * mob.moveSpeed * 0.5; 
          
          mob.animState = "walk"; // Geri dönerken yürüme animasyonu
          mob.roamWaitTime = null; // Geri dönerken bekleme olmaz
        } else {
          // Gezinme (Roaming)
          
          // Mob roam hedefine ulaştı mı? (roamTargetX henüz tanımlı değilse ilk hedefini belirlemesi için)
          const reachedTarget = mob.roamTargetX === undefined || Math.hypot(mob.x - mob.roamTargetX, mob.y - mob.roamTargetY) < 10;

          if (reachedTarget) {
              // Hedefe ulaştıysa veya ilk kez başlıyorsa: Dur ve bekleme süresi ata
              
              // YENİ HEDEFİ BELİRLE
              let newTargetX, newTargetY;
              do {
                  newTargetX = mob.spawnX + (Math.random() * maxRoamingRange * 2) - maxRoamingRange;
                  newTargetY = mob.spawnY + (Math.random() * maxRoamingRange * 2) - maxRoamingRange;
              } while (Math.hypot(newTargetX - mob.spawnX, newTargetY - mob.spawnY) > maxRoamingRange);
              
              mob.roamTargetX = newTargetX;
              mob.roamTargetY = newTargetY;
              
              // BEKLEME SÜRESİ EKLE (1 ila 3 saniye)
              mob.animState = "idle"; // Durduğu için idle animasyonu
              const pauseDuration = 1000 + Math.random() * 2000; 
              mob.roamWaitTime = now + pauseDuration; 
              
          } else {
              // Hedefe doğru yürü
              mob.animState = "walk"; // <<< YÜRÜYORSA WALK ANİMASYONU
              
              const angle = Math.atan2(mob.roamTargetY - mob.y, mob.roamTargetX - mob.x);
              mob.x += Math.cos(angle) * mob.moveSpeed * 0.25; 
              mob.y += Math.sin(angle) * mob.moveSpeed * 0.25;
              
              // Yönü güncelle (animasyon için)
              if (angle >= -Math.PI / 4 && angle <= Math.PI / 4) mob.direction = "right";
              else if (angle > Math.PI / 4 && angle <= 3 * Math.PI / 4) mob.direction = "down";
              else if (angle < -Math.PI / 4 && angle >= -3 * Math.PI / 4) mob.direction = "up";
              else mob.direction = "left";
          }
        }
        continue; // Hedef yoksa, saldırma/takip etme kodunu atla
      }
    }
    
    // 2e. HEDEF VARSA: Takip et ve Saldır
    if (targetPlayer) {
      const dist = distance(mob, targetPlayer);
      const leashRange = 800; 
      const distToSpawn = Math.hypot(mob.x - mob.spawnX, mob.y - mob.spawnY);

      if (dist > mob.aggroRange * 1.5 || distToSpawn > leashRange) {
        mob.targetId = null;
        mob.animState = "idle"; // <<< Hedefini kaybetti, idle başlasın
        continue; 
      }

      if (dist <= mob.attackRange) {
        mob.animState = "attack"; // <<< Mob saldırı menzilinde: attack animasyonu
        if (now - mob.lastAttack > mob.attackSpeed) {
          mob.lastAttack = now;
          
          let damage = mob.dmg; // Mobun temel hasarı
          
          // --- YENİ HASAR İŞLEME MANTIĞI BAŞLANGICI ---
          
          // 1. Hasar Azaltma (Yüzde - Güçlü Beden, Büyülü Zırh)
          if (targetPlayer.damageReductionPercent > 0) {
              damage *= (1 - targetPlayer.damageReductionPercent); // Örn: %15 azatma için * 0.85
              damage = Math.floor(damage);
          }
          
          // 2. Yansıtma (reflectDamagePercent - Şaman Yansıtma)
          if (targetPlayer.reflectDamagePercent > 0) {
              const reflectedDamage = Math.floor(damage * targetPlayer.reflectDamagePercent);
              // Yansıtılan hasarı moba uygula (Mob'un HP'sini hemen düşür)
              mob.hp -= reflectedDamage; 
              // Mob öldürme kontrolü (Yansıtma ile ölebilir)
              if (mob.hp <= 0 && mob.isAlive) {
                  mob.isAlive = false;
                  mob.deathTime = Date.now(); // Ölüm zamanını ayarla
                  console.log(`Mob ${mob.type} yansıtma hasarıyla öldü.`); 
              }
          }

          // 3. Mana Kalkanı (manaShieldPercent - Sura Karanlık Koruma)
          let hpDamage = damage;
          if (targetPlayer.manaShieldPercent > 0) {
              const manaCost = Math.ceil(damage * targetPlayer.manaShieldPercent); // Harcanacak mana
              
              if (targetPlayer.mp >= manaCost) {
                  targetPlayer.mp -= manaCost;
                  hpDamage = damage * (1 - targetPlayer.manaShieldPercent); // HP hasarı düşer
              }
              // Mana yetmezse mana kalkanı devre dışı kalır.
          }
          
          // 4. Nihai HP Hasarını Uygula
          targetPlayer.hp -= Math.floor(hpDamage); 
          
          // --- YENİ HASAR İŞLEME MANTIĞI SONU ---
          
          if (targetPlayer.hp <= 0 && targetPlayer.isAlive) {
            handlePlayerDeath(targetPlayer); 
            mob.targetId = null; 
          }
        }
      } else {
        // Hedefe doğru yürüyor
        mob.animState = "walk"; // <<< Mob hedefe doğru yürüyor: walk animasyonu
        const angle = Math.atan2(targetPlayer.y - mob.y, targetPlayer.x - mob.x);
        mob.x += Math.cos(angle) * mob.moveSpeed;
        mob.y += Math.sin(angle) * mob.moveSpeed;
        
        const map = MAP_DATA[mob.map];
        if (map) {
            mob.x = Math.max(0, Math.min(mob.x, map.width - mob.width));
            mob.y = Math.max(0, Math.min(mob.y, map.height - mob.height));
        }
      }
    }
  } // for(mobs) sonu

//2f. Mob Sayısını Doldur (Harita Başına)
  const mobCountByMap = {};
  const metinCountByMap = {}; 
    for (const mapName in MAP_DATA) {
        mobCountByMap[mapName] = 0;
        metinCountByMap[mapName] = 0; 
    }
    
    for (const mobId in mobs) {
        if (mobs[mobId].map && mobCountByMap[mobs[mobId].map] !== undefined && mobs[mobId].isAlive) { // Sadece CANLI mobları say
            if (mobs[mobId].isMetin) {
                 metinCountByMap[mobs[mobId].map]++; 
            } else {
                 mobCountByMap[mobs[mobId].map]++; 
            }
        }
    }

    const MAX_MOBS_PER_MAP = 100;
    const MAX_METINS_PER_MAP = 3; 
    
    for (const mapName in mobCountByMap) {
        // Normal mobları doldur
        if (mobCountByMap[mapName] < MAX_MOBS_PER_MAP) {
            // Eksik mob sayısı kadar deneme yap
            for(let i = 0; i < MAX_MOBS_PER_MAP - mobCountByMap[mapName]; i++) {
                 spawnMob(mapName);
            }
        }
        
        // Metinleri doldur (Max 3)
        if (metinCountByMap[mapName] < MAX_METINS_PER_MAP) {
             for(let i = 0; i < MAX_METINS_PER_MAP - metinCountByMap[mapName]; i++) {
                 spawnMetin(mapName); 
            }
        }
    }

  // 3. NPC Animasyon
  for (const npcId in npcs) {
    // ... (NPC animasyon kodun) ...
    const npc = npcs[npcId];
    if (CLASS_SPECS[npc.asset]) {
      npc.animTicker++;
      if (npc.animTicker >= 25) {
        npc.animTicker = 0;
        npc.animFrame = (npc.animFrame + 1) % 2;
      }
    }
  }

  // 4. PORTALLARI HER ZAMAN GÖNDER
  io.emit("gameState", { players, mobs, npcs, portals: PORTALS });
}

setInterval(serverGameLoop, 50);
setInterval(async () => { // async ekle
    for (const id in players) {
        await savePlayer(players[id]); // await ekle
    }
}, 30000); // 30 saniye

// ---------------------- SUNUCUYU BAŞLAT ----------------------
server.listen(PORT, () => {
  console.log(`Sunucu aktif: http://localhost:${PORT}`);
  initializeNpcs();
  spawnInitialMobs();
});

// --- VERİ YOLU TANIMLAMALARI (YENİ KOD) ---

// Render'ın bize verdiği disk yolunu (örn: /data) kullan. 
// Eğer yoksa (yani lokalde çalışıyorsa) __dirname kullan.
const DATA_ROOT = process.env.RENDER_DISK_MOUNT_PATH || __dirname;

const ACCOUNTS_FILE = path.join(DATA_ROOT, 'accounts.json');
const SAVE_DIR = path.join(DATA_ROOT, 'player_saves'); // Kayıt klasörümüz





// Oyuncu kayıt klasörünün var olup olmadığını kontrol et
if (!fs.existsSync(SAVE_DIR)) {
    fs.mkdirSync(SAVE_DIR);
    console.log(`Kayıt klasörü oluşturuldu: ${SAVE_DIR}`);
}