const { BlokZinciri, Islem } = require("./blockchain");
const { baslangicBakiyeleriniEkle } = require('./baslangic_bakiyesi_ekle');
const { kullanicilariOlustur } = require('./kullaniciOlusturma');

const EC = require('elliptic').ec;// Eliptik eğri kütüphanesini kullan
const egri = new EC('secp256k1');
const fs = require('fs');

// 1. Yeni kullanıcıları oluştur (ve JSON'a yaz)
const kullanicilar = kullanicilariOlustur();

// 2. Cüzdan adreslerini tanımla
const benimCuzdanAdresim = kullanicilar[0].publicKey;  //İlk kullanıcı benim
const benimAnahtar = egri.keyFromPrivate(kullanicilar[0].privateKey);

const kullanici2Adres = kullanicilar[1].publicKey;
const kullanici2Anahtar = egri.keyFromPrivate(kullanicilar[1].privateKey);

let snowcoin;
if (fs.existsSync('zincir.json')) {
    const data = fs.readFileSync('zincir.json');
    const parsed = JSON.parse(data);
    snowcoin = BlokZinciri.fromJSON(parsed);
}
else{
 snowcoin = new BlokZinciri(benimCuzdanAdresim); //zincir daha önce oluşmamışsa
}

baslangicBakiyeleriniEkle(snowcoin, 'kullanicilar.json');

snowcoin.bekleyenIslemleriMineEt(benimCuzdanAdresim);

//*Zincirde yaptığımız işlemler
const islem1 = new Islem(benimCuzdanAdresim, kullanici2Adres, 17);
console.log("Fatma'nın bakiyesi: ", snowcoin.adresBakiyesi(benimCuzdanAdresim));
console.log('Zincir geçerli mi?', snowcoin.zincirGecerliMi()); //

islem1.islemImzala(benimAnahtar);// İşlemi özel anahtarımızla imzala
snowcoin.islemEkle(islem1);// İmzalanmış işlemi zincire ekle

// Madenciliği başlat (işlemleri bloğa koyup blok üret)
console.log('\nMadencilik başlatılıyor...');
snowcoin.bekleyenIslemleriMineEt(benimCuzdanAdresim);
// Cüzdanımızın güncel bakiyesini yazdır
console.log('\nFatma\'nın bakiyesi: ', snowcoin.adresBakiyesi(benimCuzdanAdresim));
const islem2 = new Islem(benimCuzdanAdresim, kullanici2Adres, 17);
islem2.islemImzala(benimAnahtar);
snowcoin.islemEkle(islem2);
// Zincirin bütünlüğünü kontrol et
console.log('Zincir geçerli mi?', snowcoin.zincirGecerliMi());

fs.writeFileSync('zincir.json', JSON.stringify(snowcoin, null, 2));