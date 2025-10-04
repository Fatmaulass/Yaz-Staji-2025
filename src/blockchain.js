const SHA256 = require('crypto-js/sha256'); 
const EC = require('elliptic').ec;
const egri = new EC('secp256k1'); // Bitcoin standardı

// İşlem sınıfı
class Islem {
    constructor(gonderenAdres, aliciAdres, miktar,ucret = 0) {
        this.gonderenAdres = gonderenAdres;
        this.aliciAdres = aliciAdres;
        this.miktar = miktar;
        this.ucret = ucret; // yeni eklendi
        this.zamanDamgasi = Date.now(); // zaman damgası eklemek ileride lazım olur 
    }
    hashHesapla() {
        return SHA256(this.gonderenAdres + this.aliciAdres + this.miktar + this.ucret + this.zamanDamgasi).toString();
    }
    islemImzala(imzalayanAnahtar) {
        if (imzalayanAnahtar.getPublic('hex') !== this.gonderenAdres) {
            throw new Error('Başkasının cüzdanıyla işlem imzalayamazsınız!');
        }
        const islemHash = this.hashHesapla();
        const imza = imzalayanAnahtar.sign(islemHash, 'base64');
        this.imza = imza.toDER('hex');
    }
    gecerliMi() {
        if (this.gonderenAdres === null) return true;

        if (!this.imza || this.imza.length === 0) {
            throw new Error('İşlemde imza yok!');
        }

        const genelAnahtar = egri.keyFromPublic(this.gonderenAdres, 'hex');
        return genelAnahtar.verify(this.hashHesapla(), this.imza);
    }
    static fromJSON(json) {
        const islem = new Islem(json.gonderenAdres, json.aliciAdres, json.miktar, json.ucret);
        islem.zamanDamgasi = json.zamanDamgasi;
        islem.imza = json.imza;
        return islem;
    }

}

// Blok sınıfı
class Blok {
    constructor(zamanDamgasi, islemler, oncekiHash = '') {
        this.oncekiHash = oncekiHash;
        this.zamanDamgasi = zamanDamgasi;
        this.islemler = islemler;
        this.nonce = 0;
        this.hash = this.hashHesapla();
    }

    hashHesapla() {
        return SHA256(this.oncekiHash + this.zamanDamgasi + JSON.stringify(this.islemler) + this.nonce).toString();
    }

    bloguMineEt(zorluk) {
        while (this.hash.substring(0, zorluk) !== Array(zorluk + 1).join("0")) {
            this.nonce++;
            this.hash = this.hashHesapla();
        }
    }

    islemlerGecerliMi() {
        for (const islem of this.islemler) {
            if (!islem.gecerliMi()) {
                return false;
            }
        }
        return true;
    }
    static fromJSON(json) {
        const blok = new Blok(json.zamanDamgasi, json.islemler.map(Islem.fromJSON), json.oncekiHash);
        blok.nonce = json.nonce;
        blok.hash = json.hash;
        return blok;
    }
}

// Blok zinciri sınıfı
class BlokZinciri {
    constructor(ayarlar = {}) {
        this.benimCuzdanAdresim = ayarlar.benimCuzdanAdresim||null;
        this.zincir = ayarlar.zincir ||[this.genesisBlokOlustur()];
        this.zorluk = ayarlar.zorluk || 4 ;
        this.bekleyenIslemler = ayarlar.bekleyenIslemler ||[];
        this.madenciOdulu = ayarlar.madenciOdulu || 100;
    }
    static fromJSON(jsonData) {
        const yeniZincir = new BlokZinciri(); // boş bir zincir oluştur
        yeniZincir.zorluk = jsonData.zorluk;
        yeniZincir.madenciOdulu = jsonData.madenciOdulu;

        // Zincirdeki blokları tekrar Blok nesnesine dönüştür
        yeniZincir.zincir = jsonData.zincir.map(blokJSON => Blok.fromJSON(blokJSON));

        // Bekleyen işlemleri de geri yükle
        yeniZincir.bekleyenIslemler = jsonData.bekleyenIslemler.map(islemJSON => Islem.fromJSON(islemJSON));

        return yeniZincir;
    }
    genesisBlokOlustur() {
        const islemler = this.benimCuzdanAdresim
            ? [new Islem(null, this.benimCuzdanAdresim, 1000)]
            : [];

        return new Blok("23/07/2025", /*[baslangicIslemi]*/islemler, "0");
    }

    sonBlok() {
        return this.zincir[this.zincir.length - 1];
    }
    bekleyenIslemleriTemizle() {
        const GECERLILIK_SURESI = 1000 * 60 * 60; // 1 saat (milisaniye)
        this.bekleyenIslemler = this.bekleyenIslemler.filter(islem => {
            return (Date.now() - islem.zamanDamgasi) < GECERLILIK_SURESI;
        });
    }

  bekleyenIslemleriMineEt(madenciAdresi) {
        this.bekleyenIslemleriTemizle();
        const maxIslemSayisi = 5;
        // İşlem ücretlerini ve işlemleri sınırlı olarak seç
        let islemler = this.bekleyenIslemler.slice(0, maxIslemSayisi);
        let toplamIslemUcretleri = 0;
        for (const islem of islemler) {
            toplamIslemUcretleri += islem.ucret;
        }

        // Madenci ödülü işlemini oluştur ve bloğa ekle
        const odulIslemi = new Islem(null, madenciAdresi, this.madenciOdulu + toplamIslemUcretleri);
        islemler.push(odulIslemi);

        let blok = new Blok(Date.now(), islemler, this.sonBlok().hash);
        blok.bloguMineEt(this.zorluk);
        console.log("Blok başarıyla kazıldı!");
        this.zincir.push(blok);

        // Bekleyen işlemler listesinden sadece madenlenenleri temizle.
        this.bekleyenIslemler.splice(0, maxIslemSayisi);
    }

    islemEkle(islem) {
        if (islem.gonderenAdres !== null){ //genesisBlockta hata vermesin diye
            if (!islem.gonderenAdres || !islem.aliciAdres) {
                throw new Error('İşlemde gönderen ve alıcı adresi olmalı!');
            }
            if (!islem.gecerliMi()) {
                throw new Error('Geçersiz işlem zincire eklenemez!');
            }
            if (this.adresinOnaylanmisBakiyesi(islem.gonderenAdres) < (islem.miktar + (islem.ucret || 0))) {
                throw new Error('Yetersiz bakiye!');
            }
        }   
        this.bekleyenIslemler.push(islem);
    }
    adresBakiyesi(adres) {
        let bakiye = 0;
        for (const blok of this.zincir) {
            for (const islem of blok.islemler) {
                if (islem.gonderenAdres === adres) {
                    bakiye -= islem.miktar + (islem.ucret || 0);
                }
                if (islem.aliciAdres === adres) {
                    bakiye += islem.miktar;
                }
            }
        }
        //  Bekleyen işlemler de hesaba katılmalı
        for (const islem of this.bekleyenIslemler) {
            if (islem.gonderenAdres === adres) {
                bakiye -= islem.miktar  + (islem.ucret || 0);
            }
            if (islem.aliciAdres === adres) {
                bakiye += islem.miktar;
            }
        }
        return bakiye;
    }

    adresinOnaylanmisBakiyesi(adres) {
        let bakiye = 0;
        // Sadece zincire eklenmiş blokları tara
        for (const blok of this.zincir) {
            for (const islem of blok.islemler) {
                if (islem.gonderenAdres === adres) {
                    bakiye -= islem.miktar + (islem.ucret || 0);
                }
                if (islem.aliciAdres === adres) {
                    bakiye += islem.miktar;
                }
            }
        }
        return bakiye;
    }

    zincirGecerliMi() {
        for (let i = 1; i < this.zincir.length; i++) {
            const guncelBlok = this.zincir[i];
            const oncekiBlok = this.zincir[i - 1];
            if (!guncelBlok.islemlerGecerliMi()) {
                return false;
            }
            if (guncelBlok.hash !== guncelBlok.hashHesapla()) {
                return false;
            }
            if (guncelBlok.oncekiHash !== oncekiBlok.hash) {
                return false;
            }
        }
        return true;
    }
}

// Sınıfları dışa aktar
module.exports.BlokZinciri = BlokZinciri;
module.exports.Islem = Islem;
module.exports.Blok = Blok;