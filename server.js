const express = require("express");
const http = require("http");
const socketIo = require("socket.io");

const fs = require('fs'); 
const path = require('path'); 

// YENİ: Şifreleri güvenli hale getirmek için kripto kütüphanesi ekle (npm install bcrypt)
// Eğer npm install bcrypt yapmadıysanız, aşağıdaki satırı şimdilik yorum satırı yapın ve sadece düz şifre kullanın.
// const bcrypt = require('bcrypt');
// const saltRounds = 10;

// Eğer bcrypt kurmadıysanız, aşağıdaki basit (güvenli olmayan) şifre kontrolünü kullanın.
// **UYARI: Gerçek bir oyunda bcrypt kullanmak zorunludur!**
const hashPassword = (password) => password;
const comparePassword = (password, hash) => password === hash;
const playerToAccountMap = {}; // socket.id -> { username: '...', characterName: '...' }

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
      2: { id: "warrior_1_2", name: "Hava Kılıcı", type: "active", mpCost: 30, cooldown: 8000, damageMultiplier: 2.0 },
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
    portals: [
      { x: 3120, y: 0, width: 200, height: 40, targetMap: "forest", targetX: 3080, targetY: 4300 },
    ],
    allowedLevelRange: [1, 20], // Köyde max 20 Lv mob doğabilir.
    // YENİ EKLENDİ: Kademeli Zorluk için Bölge Tanımları
    zones: [
      { maxRadius: 1000, levelMin: 1, levelMax: 10 }, // Güvenli bölge dışı, Lv 1-10 (Wolf, Snake)
      { maxRadius: 3500, levelMin: 6, levelMax: 15 }, // Orta bölge, Lv 6-15 (Orc)
      { maxRadius: 4500, levelMin: 11, levelMax: 20 }, // Dış bölge, Lv 11-20 (Demonlar da burada doğabilir)
    ],
  },
  forest: {
    width: 6160,
    height: 4480,
    portals: [
      // Köye dönüş portalı
      { x: 2980, y: 4440, width: 200, height: 40, targetMap: "village", targetX: 3220, targetY: 100 },
      // YENİ: Çöle gidiş portalı (Ormanın kuzeyinde)
      { x: 3000, y: 0, width: 200, height: 40, targetMap: "desert", targetX: 3000, targetY: 4300 },
    ],
    allowedLevelRange: [21, 40], // YENİ SEVİYE ARALIĞI (Çakışmayı önlemek için)
  },
  // YENİ: Çöl Haritası
  desert: {
    width: 6160,
    height: 4480,
    portals: [
      // Ormana dönüş portalı (Çölün güneyinde)
      { x: 3000, y: 4440, width: 200, height: 40, targetMap: "forest", targetX: 3000, targetY: 100 },
      // YENİ: Buzul haritasına gidiş (Çölün kuzeyinde)
      { x: 3000, y: 0, width: 200, height: 40, targetMap: "ice", targetX: 500, targetY: 4300 },
    ],
    allowedLevelRange: [41, 60], // (Bu aynı kalabilir)
  },
  // YENİ: Buzul Haritası
  ice: {
    width: 6160,
    height: 4480,
    portals: [
      // Çöle dönüş portalı (Buzulun güneyinde)
      { x: 500, y: 4440, width: 200, height: 40, targetMap: "desert", targetX: 3000, targetY: 100 },
    ],
    allowedLevelRange: [61, 80], // (Bu aynı kalabilir)
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
const MAX_CHARACTERS_PER_ACCOUNT = 2; // YENİ: Hesap başına maksimum karakter sayısı

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
function recalculatePlayerStats(player) {
    if (!player) return;

    const stats = player.stats;
    const equipment = player.equipment;
    const buffs = player.activeBuffs || {}; // Artık buff'ları da hesaba katacağız

    // --- YENİ: BUFF ETKİLERİNİ HESAPLAMA ---
    // Bu değişkenler, buff'lardan gelen geçici bonusları tutar
    let buffDmgBonus = 0;       // Örn: Büyülü Keskinlik
    let buffDefBonus = 0;       // Örn: Güçlü Beden, Büyülü Zırh
    let buffAtkSpeedBonus = 0;  // Örn: Öfke
    // (Gelecekte eklenebilir: buffHpBonus, buffMpBonus, vb.)

    // Aktif buff'ları kontrol et
    if (buffs["warrior_1_4"]) { // Öfke (Savaşçı)
        // Öfke'nin etkisini burada tanımla. Örn: +%20 Saldırı Hızı (şimdilik hasar verelim)
        // Not: Saldırı hızı (ATTACK_COOLDOWN) anlık olarak "attack" eventinde kontrol edilecek.
        // Şimdilik küçük bir hasar bonusu ekleyelim:
        buffDmgBonus += 50; // Örnek: Öfke +50 hasar veriyor
    }
    if (buffs["warrior_2_1"]) { // Güçlü Beden (Savaşçı)
        // Güçlü Beden'in etkisini tanımla. Örn: +150 Savunma
        buffDefBonus += 150; 
    }
    if (buffs["sura_1_1"]) { // Büyülü Keskinlik (Sura)
        // Büyülü Keskinlik: +INT*1.5 kadar hasar bonusu
        buffDmgBonus += Math.floor(stats.int * 1.5);
    }
    if (buffs["sura_1_2"]) { // Büyülü Zırh (Sura)
        // Büyülü Zırh: +INT*1.0 kadar defans bonusu
        buffDefBonus += Math.floor(stats.int * 1.0);
    }
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
    
    // Saldırı: Stat + Eşya + BUFF
    player.bonusDmg = bonusDmg + Math.floor(stats.str * 1.5 + stats.dex * 0.5) + buffDmgBonus; 
    // Toplam Defans: Stat + Eşya + BUFF
    player.bonusDef = bonusDef + player.baseDef + buffDefBonus; 
    // Bonus HP: Stat + Eşya
    player.bonusHp = bonusHp + (stats.vit * 10); 
    // Bonus MP: Stat + Eşya
    player.bonusMp = bonusMp + (stats.int * 5);  
    // Hız
    player.bonusSpeed = bonusSpeed; 
    // (Saldırı Hızı bonusunu 'player' objesinde saklayabiliriz)
    player.bonusAttackSpeed = buffAtkSpeedBonus;

    // 4. Nihai Max Değerleri Ayarla
    player.maxHp = 100 + player.bonusHp;
    player.maxMp = 50 + player.bonusMp;

    // 5. Mevcut HP/MP'yi sınırlar içinde tut
    player.hp = Math.min(player.hp, player.maxHp);
    player.mp = Math.min(player.mp, player.maxMp);
}

function savePlayer(player) {
    // 1. Kaydedilecek veriyi temizle (Anlık durumları sil)
    const { 
        id, name, kingdom, class: charClass, map, x, y, direction,
        level, exp, maxExp, hp, maxHp, mp, maxMp, yang, 
        stats, statPoints, equipment, skillSet, skills, skillPoints 
        // keysPressed, animState, lastAttack, bonusDmg gibi türetilmişler/anlık durumlar hariç
    } = player;
    
    const saveObject = { 
        id, name, kingdom, class: charClass, map, x, y, direction,
        level, exp, maxExp, hp: player.hp, maxHp, mp: player.mp, maxMp, yang,
        stats, statPoints, equipment, skillSet, skills, skillPoints 
    };

    // 2. Dosya yolunu belirle
    const filePath = path.join(SAVE_DIR, `${player.name}.json`);

    try {
        fs.writeFileSync(filePath, JSON.stringify(saveObject, null, 2));
        // console.log(`Oyuncu ${player.name} kaydedildi.`);
    } catch (error) {
        console.error(`Oyuncu ${player.name} kaydedilirken HATA:`, error);
    }
}

/**
 * Oyuncu verilerini dosyadan yükler.
 * @param {string} playerName - Yüklenecek oyuncunun adı.
 * @returns {object | null} - Yüklenen oyuncu verisi veya null.
 */
function loadPlayer(playerName) {
    const filePath = path.join(SAVE_DIR, `${playerName}.json`);
    
    if (fs.existsSync(filePath)) {
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error(`Oyuncu ${playerName} yüklenirken HATA:`, error);
            return null;
        }
    }
    return null; // Dosya yoksa null dön
}

function createPlayer(socket, data) {
    let player;
    const existingData = loadPlayer(data.name);

    if (existingData) {
        // --- Mevcut Oyuncuyu Yükle ---
        const specs = CLASS_SPECS[existingData.class] || CLASS_SPECS.default;
        player = {
            ...existingData, // Kayıtlı verileri al
            id: socket.id, // Yeni socket ID'si
            width: specs.width,
            height: specs.height,
            baseDmg: specs.baseDmg,
            
            // Anlık durumları sıfırla/başlangıç değeri ver
            direction: existingData.direction || "down",
            animState: "idle",
            keysPressed: { w: false, a: false, s: false, d: false },
            lastAttack: 0,
            isAlive: true,
            
            // Yeni eklenen/mevcut olmayan alanları ekle (güvenlik için)
            skillSet: existingData.skillSet === undefined ? null : existingData.skillSet,
            skills: existingData.skills || {},
            activeBuffs: {},
            skillCooldowns: {}
        };
        console.log(`${player.name} (${player.class}) YÜKLENDİ.`);
        
    } else {
        // --- Yeni Oyuncu Oluştur ---
        const specs = CLASS_SPECS[data.class] || CLASS_SPECS.default;
        player = {
            id: socket.id,
            name: data.name,
            kingdom: data.kingdom,
            class: data.class,
            map: "village",
            x: 3200,
            y: 2400,
            width: specs.width,
            height: specs.height,
            direction: "down",
            animState: "idle",
            level: 1,
            exp: 0,
            maxExp: 100,
            hp: 100,
            maxHp: 100,
            mp: 50, // Düzeltme: 500 değil 50
            maxMp: 50,
            baseDmg: specs.baseDmg,
            
            yang: 5000, 
            
            bonusDmg: 0, bonusDef: 0, baseDef: 0, magicAttack: 0, 
            bonusHp: 0, bonusMp: 0, bonusSpeed: 0, bonusAttackSpeed: 0,

            keysPressed: { w: false, a: false, s: false, d: false },
            lastAttack: 0,
            isAlive: true, 
            equipment: {
                weapon: null, helmet: null, armor: null, shield: null,
                necklace: null, earring: null, bracelet: null, shoes: null
            },

            skillSet: null,
            skillPoints: 0, 
            stats: { vit: 5, str: 5, int: 5, dex: 5 },
            statPoints: 0,
            skills: {},
            activeBuffs: {},
            skillCooldowns: {} 
        };
        console.log(`${player.name} adlı YENİ oyuncu oluşturuldu.`);
    }

    players[socket.id] = player;
    recalculatePlayerStats(player);
    return player;
}

// server.js (spawnMob fonksiyonunun TAMAMI)
function spawnMob() {
  const mapName = "village";
  const map = MAP_DATA[mapName];
  if (!map) return;

  const mapLevelRange = map.allowedLevelRange || [1, 20]; 
  const mapCenter = { x: 3200, y: 3000 }; 
  const safeZoneRadius = 600; 
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
      const currentZone = map.zones.find(zone => distanceToCenter <= zone.maxRadius);
      
      if (currentZone) {
          targetLevelMin = currentZone.levelMin;
          targetLevelMax = currentZone.levelMax;
      }
      // NOT: Eğer zone bulunamazsa, haritanın genel aralığı kullanılır (1-20)
  }

  // 3. Bölge Seviye Aralığına Uyan Mobları Filtrele
  // Moblar artık sadece (targetLevelMin - targetLevelMax) aralığına uygun olanlardan seçilecek.
  const validMobs = MOB_TYPES.filter(m => {
    // Mobun seviye aralığı hedef seviye aralığıyla çakışmalı
    return m.levelRange[1] >= targetLevelMin && m.levelRange[0] <= targetLevelMax;
  });
  
  if (validMobs.length === 0) {
    // console.log(`[HATA] ${targetLevelMin}-${targetLevelMax} aralığında geçerli mob bulunamadı.`);
    return;
  }
  
  // 4. Mob tipini rastgele seç (Artık sadece uygun moblar validMobs içinde)
  const mobType = validMobs[Math.floor(Math.random() * validMobs.length)];
  
  // 5. Mob seviyesini aralık içinde rastgele belirle
  const levelMin = Math.max(mobType.levelRange[0], targetLevelMin);
  const levelMax = Math.min(mobType.levelRange[1], targetLevelMax);
  
  if (levelMin > levelMax) return; 
  
  const level = levelMin + Math.floor(Math.random() * (levelMax - levelMin + 1));
  
  // 6. Mob objesini oluştur (Aynı kalır)
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

function giveExp(player, exp) {
  player.exp += exp;
  while (player.exp >= player.maxExp) {
    player.level++;
    player.skillPoints++; // Bu satır zaten vardı
    player.statPoints += 3; // <-- YENİ EKLENECEK SATIR BUDUR
    player.exp -= player.maxExp;
    player.maxExp = Math.floor(player.maxExp * 1.5);
    player.hp = player.maxHp;
    player.mp = player.maxMp;

    // YENİ EKLENEN BİLDİRİM KONTROLÜ
    // Eğer oyuncu 5. seviyeye ulaştıysa VE henüz bir beceri seti seçmediyse
    if (player.level === 5 && player.skillSet === null) {
      // Sadece bu oyuncunun client'ına özel bir event gönder
      const socket = io.sockets.sockets.get(player.id);
      if (socket) {
        socket.emit("showNotification", {
          title: "Beceri Ustası",
          message: `Tebrikler, 5. Seviye oldun! Köydeki sınıf ustana (${player.class} Ustası) giderek ilk becerilerini öğrenebilirsin.`
        });
      }
    }
    // YENİ KONTROL SONU
  }
}

function distance(a, b) {
  const dx = a.x + a.width / 2 - (b.x + b.width / 2);
  const dy = a.y + a.height / 2 - (b.y + b.height / 2);
  return Math.sqrt(dx * dx + dy * dy);
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
  while (Object.keys(mobs).length < 40) {
    spawnMob();
  }
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
  // YENİ: Ölü oyuncu saldıramaz
  if (!player || !player.isAlive || Date.now() - player.lastAttack < ATTACK_COOLDOWN) return;
  player.lastAttack = Date.now();
    player.animState = "slash";

    const totalDmg = player.baseDmg + player.bonusDmg;

    for (const mobId in mobs) {
      const mob = mobs[mobId];
      if (mob.map === player.map && mob.isAlive && distance(player, mob) < ATTACK_RANGE) {
        
        // CANAVAR HASAR ALDI
        mob.hp -= totalDmg;
        
        // YENİ: REAKTİF AI TETİKLEMESİ
        // Canavar hayattaysa VE bir hedefi yoksa, saldırana hedef al
        if (mob.hp > 0 && !mob.targetId) {
          mob.targetId = player.id;
        }

        // CANAVAR ÖLDÜ
        if (mob.hp <= 0) {
          mob.isAlive = false;
          giveExp(player, mob.exp);
          
          // --- YANG DÜŞÜRME BÖLÜMÜ ---
          // Düşen Yang miktarını belirle (Örn: mob level'ının 50-150 katı)
          const droppedYang = mob.level * (Math.floor(Math.random() * 101) + 50);
          player.yang += droppedYang; // Oyuncuya Yang'ı anında ekle
          
          socket.emit("showNotification", {
            title: "Yang Düştü!",
            message: `${mob.type} canavarından ${droppedYang.toLocaleString()} Yang kazandın.` // toLocaleString eklendi
          });
          // --- YANG DÜŞÜRME BÖLÜMÜ SONU ---
          
          if (Math.random() < mob.dropRate) {
            const itemId = mob.drops[Math.floor(Math.random() * mob.drops.length)];
            const item = { ...ITEM_DB[itemId] };
            console.log(`${player.name} ${mob.type}'dan ${item.name} düşürdü!`);
            
            // --- YENİ EKLENDİ: EŞYA DÜŞME BİLDİRİMİ ---
            socket.emit("showNotification", {
                title: "Eşya Düştü!",
                message: `${mob.type} canavarından **${item.name}** kazandın.`
            });
            // --- EŞYA DÜŞME BİLDİRİMİ SONU ---
            
            socket.emit("itemDrop", { item });
          }
        }
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
    const cooldownEnds = player.skillCooldowns[skillId] || 0;
    
    // --- YENİ MANTIK: Buff'lar ---
    // Eğer beceri bir buff ise VE zaten aktifse, cooldown'da olmasa bile yenilemesine izin verme
    // (veya opsiyonel olarak: yenilemesine izin ver)
    // Şimdilik: Zaten aktifse hata ver
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
    // --- YENİ MANTIK SONU ---

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
    const physicalBase = player.baseDmg + player.bonusDmg; // STR/DEX ve eşyalardan gelen düz vuruş hasarı
    const magicalBase = player.magicAttack; // INT'ten gelen büyü hasarı

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
                if (mob.hp <= 0) {
                    mob.isAlive = false;
                    giveExp(player, mob.exp);
                    // ... (drop mantığı) ...
                }
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
        
    // --- BURASI GÜNCELLENDİ ---
    } else if (skillData.type === "buff") {
        // Buff'ın süresini SKILL_DB'den al (örn: 15000ms = 15 saniye)
        // Beceri seviyesine göre süreyi uzatabiliriz: örn: her level +1 saniye
        const duration = (skillData.duration || 10000) + (skillLevel * 1000); 
        const endTime = Date.now() + duration;

        // Buff'ı oyuncunun aktif listesine ekle
        player.activeBuffs[skillId] = endTime;

        console.log(`${player.name}, ${skillData.name} (Buff) ${duration/1000} saniyeliğine etkinleştirdi.`);

        // Buff'ın statüleri anında değiştirmesi için yeniden hesapla
        recalculatePlayerStats(player);
    }
    // --- GÜNCELLEME SONU ---

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
      
      // Miktarı belirle: Yığın itemse (91XX ID'ler), miktar stackSize olur. Değilse 1'dir.
      const actualQuantity = itemData.stackSize || quantity; 
      const totalCost = itemData.buyPrice * quantity; // Pot yığınlarında quantity hep 1 olmalı.

      if (player.yang < totalCost) {
          socket.emit("showNotification", { title: "Hata", message: "Yeterli Yang'ın yok." });
          return;
      }

      // Başarılı alışveriş
      player.yang -= totalCost;

      // Item objesini oluştur
      const itemToDrop = { ...itemData };
      itemToDrop.quantity = actualQuantity; // Yığın miktarı eklendi

      // itemDrop eventini kullanarak itemi envantere ekleyelim
      socket.emit("itemDrop", { item: itemToDrop });
      
      socket.emit("showNotification", { 
          title: "Satın Alındı", 
          message: `${itemData.name} x${actualQuantity} için ${totalCost.toLocaleString()} Yang harcadın.` 
      });
  });

  // --- YENİ EKLENDİ: EŞYA SATMA EVENTİ ---
  socket.on("sellItem", ({ itemId, inventoryIndex }) => {
      const player = players[socket.id];
      const itemData = ITEM_DB[itemId];

      if (!player || !itemData || !itemData.sellPrice) return;

      const sellPrice = itemData.sellPrice;
      
      // Yang'ı ekle
      player.yang += sellPrice;

      // Client'a envanterden silmesi için sinyal gönder
      socket.emit("itemSold", { 
          inventoryIndex: inventoryIndex
      });

      socket.emit("showNotification", { 
          title: "Satıldı", 
          message: `**${itemData.name}** eşyasını ${sellPrice.toLocaleString()} Yang karşılığında sattın.` 
      });
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
    // ... (Aynı kalır, önceki güncellemedeki mantık) ...
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
        
        // Envanterden düşme onayı (quantity azaltma client tarafında)
        socket.emit("consumableUsed", { inventoryIndex: inventoryIndex });
        
        // ... (showNotification aynı kalır) ...
        socket.emit("showNotification", {
            title: "Pot Kullanıldı",
            message: `**${itemData.name}** kullanıldı. HP/MP yenilendi.`
        });
    }
  });

  socket.on("registerAttempt", async ({ username, password }) => {
    if (accounts[username]) {
        socket.emit("loginFail", "Bu kullanıcı adı zaten alınmış.");
        return;
    }

    // const hashedPassword = await hashPassword(password); // Eğer bcrypt kullanıyorsanız
    const hashedPassword = hashPassword(password); // Basit şifre (güvensiz)

    accounts[username] = { 
        password: hashedPassword,
        characters: [] // Bu hesaba ait karakterlerin listesi
    };
    saveAccounts();
    socket.emit("registerSuccess");
});

// YENİ EVENT: Giriş Yapma
socket.on("loginAttempt", async ({ username, password }) => {
    const account = accounts[username];
    if (!account) {
        socket.emit("loginFail", "Kullanıcı adı veya şifre yanlış.");
        return;
    }

    // const match = await comparePassword(password, account.password); // Eğer bcrypt kullanıyorsanız
    const match = comparePassword(password, account.password); // Basit şifre

    if (match) {
        // Başarılı giriş: socket ID'sine hesabı ata
        playerToAccountMap[socket.id] = { username: username, characters: account.characters };
        
        // KRİTİK: Karakter listesini de gönder
        socket.emit("loginSuccess", { characters: account.characters });
        
    } else {
        socket.emit("loginFail", "Kullanıcı adı veya şifre yanlış.");
    }
});

// YENİ EVENT: Karakter Oluşturma/Giriş Yapma
socket.on("createOrJoinCharacter", (characterChoices) => {
    const accountInfo = playerToAccountMap[socket.id];
    if (!accountInfo) {
         console.log("HATA: Hesap bilgisi yok.");
         return; // Giriş yapılmamışsa burada kesilir.
    }
    console.log(`Giriş/Oluşturma Denemesi: ${characterChoices.name}`);

    const charName = characterChoices.name;
    const account = accounts[accountInfo.username];

    // 1. Zaten mevcut karakter mi? (Giriş Yapma)
    if (account.characters.includes(charName)) {
        // KRİTİK KONTROL: Karakter zaten oyunda mı?
        const alreadyOnline = Object.values(players).some(p => p.name === charName);
        if (alreadyOnline) {
             socket.emit("loginFail", "Bu karakter zaten oyunda.");
             return;
        }

        // Karakter zaten kayıtlıysa, doğrudan yükle
        const player = createPlayer(socket, { name: charName });
        // playerToAccountMap'i güncelle
        playerToAccountMap[socket.id].characterName = charName; 
        socket.emit("characterJoined");
        return;
    }

    // 2. Yeni Karakter Oluşturma Kontrolü
    
    // A. Slot kontrolü
    if (account.characters.length >= MAX_CHARACTERS_PER_ACCOUNT) {
         socket.emit("characterCreationFail", `Maksimum karakter sayısına (${MAX_CHARACTERS_PER_ACCOUNT}) ulaştınız.`);
         return;
    }
    
    // B. İsim kontrolü (Global olarak dosya var mı?)
    const existingPlayerData = loadPlayer(charName);
    if (existingPlayerData) {
         // Başka bir hesaba ait karakter adına sahip olamaz.
        socket.emit("characterCreationFail", "Bu karakter adı zaten alınmış.");
        return;
    }

    // 3. Yeni Karakter Başarılı Şekilde Oluşturuldu
    const player = createPlayer(socket, characterChoices);

    // Hesabın karakter listesine ekle
    account.characters.push(charName);
    saveAccounts();

    // playerToAccountMap'i güncelle
    playerToAccountMap[socket.id].characterName = charName; 

    socket.emit("characterJoined");
});

// createPlayer fonksiyonunu güncelleyin: Artık SADECE data.name'e göre yükleme yapacak.
// Zaten oyuncu varsa yükleyecek, yoksa sıfırdan oluşturacak (Yukarıdaki 3. adımda kontrol edildi)

// disconnect eventini güncelle (Ek bilgi için)
socket.on("disconnect", () => {
    const player = players[socket.id];
    if (player) {
        savePlayer(player);
        delete players[socket.id];
    } 
    delete playerToAccountMap[socket.id]; // Hesap bilgisini temizle
    console.log("Bağlantı koptu:", socket.id);
});
});

// ---------------------- SUNUCU OYUN DÖNGÜSÜ ----------------------
function serverGameLoop() {
  const now = Date.now(); // 'now' değişkenini döngünün başına taşıdık

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
  // const now = Date.now(); // Başa taşındı
  for (const mobId in mobs) {
    // ... (Mevcut mob mantığının tamamı burada devam ediyor) ...
    // ... (Hiçbir değişiklik yapmana gerek yok) ...
    const mob = mobs[mobId];

    // 2a. Ölüm Kontrolü
    if (!mob.isAlive) {
      delete mobs[mobId];
      continue; // Döngüde bir sonraki mob'a geç
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
      
      if (!mob.targetId) {
        const distToSpawn = Math.hypot(mob.x - mob.spawnX, mob.y - mob.spawnY);
        if (distToSpawn > 5) { 
          const angle = Math.atan2(mob.spawnY - mob.y, mob.spawnX - mob.x);
          mob.x += Math.cos(angle) * mob.moveSpeed * 0.5; 
          mob.y += Math.sin(angle) * mob.moveSpeed * 0.5; 
        }
        continue; 
      }
    }

    // 2e. HEDEF VARSA: Takip et ve Saldır
    if (targetPlayer) {
      const dist = distance(mob, targetPlayer);
      const leashRange = 800; 
      const distToSpawn = Math.hypot(mob.x - mob.spawnX, mob.y - mob.spawnY);

      if (dist > mob.aggroRange * 1.5 || distToSpawn > leashRange) {
        mob.targetId = null;
        continue; 
      }

      if (dist <= mob.attackRange) {
        if (now - mob.lastAttack > mob.attackSpeed) {
          mob.lastAttack = now;
          targetPlayer.hp -= mob.dmg;
          
          if (targetPlayer.hp <= 0 && targetPlayer.isAlive) {
            handlePlayerDeath(targetPlayer); 
            mob.targetId = null; 
          }
        }
      } else {
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

  // 2f. Mob Sayısını Doldur
  if (Object.keys(mobs).length < 200) {
    spawnMob();
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
setInterval(() => {
    for (const id in players) {
        savePlayer(players[id]);
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

// --- HESAP VE KAYIT YÖNETİMİ ---
let accounts = loadAccounts(); // Hesap verilerini global olarak tut

function loadAccounts() {
    if (fs.existsSync(ACCOUNTS_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'));
        } catch (error) {
            console.error("HESAP YÜKLENİRKEN HATA:", error);
            return {};
        }
    }
    return {};
}

function saveAccounts() {
    try {
        fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
    } catch (error) {
        console.error("HESAP KAYDEDİLİRKEN HATA:", error);
    }
}

// Oyuncu kayıt klasörünün var olup olmadığını kontrol et
if (!fs.existsSync(SAVE_DIR)) {
    fs.mkdirSync(SAVE_DIR);
    console.log(`Kayıt klasörü oluşturuldu: ${SAVE_DIR}`);
}