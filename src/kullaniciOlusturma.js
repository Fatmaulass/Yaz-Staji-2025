const fs = require('fs');
const EC = require('elliptic').ec;
const ec = new EC('secp256k1');
const { Blok, Islem, BlokZinciri } = require('./blockchain');

const KAC_KULLANICI = 3;
const BASLANGIC_BAKIYESI = 1000;

function kullanicilariOlustur() {
  let kullanicilar = [];
  if (fs.existsSync('kullanicilar.json')) {
    const data = fs.readFileSync('kullanicilar.json');
    kullanicilar = JSON.parse(data);
    console.log('Mevcut kullanıcılar yüklendi.');
  }

  const mevcutKullaniciSayisi = kullanicilar.length;

  for (let i = 1; i <= KAC_KULLANICI; i++) {
    const key = ec.genKeyPair();
    const kullanici = {
      id: `kullanici ${mevcutKullaniciSayisi + i}`,
      publicKey: key.getPublic('hex'),
      privateKey: key.getPrivate('hex'),
      bakiye: BASLANGIC_BAKIYESI
    };
    kullanicilar.push(kullanici);
  }
  fs.writeFileSync('kullanicilar.json', JSON.stringify(kullanicilar, null, 2));
  console.log(`${KAC_KULLANICI} yeni kullanıcı kullanicilar.json dosyasına kaydedildi.`);

  // Genesis blokta her kullanıcıya başlangıç bakiyesi veren işlemler oluştur
  const genesisIslemleri = kullanicilar.map(kullanici => {
    return new Islem(null, kullanici.publicKey, BASLANGIC_BAKIYESI);
  });

  const genesisBlok = new Blok(Date.now(), genesisIslemleri, '0');
  const blockchain = new BlokZinciri();
  blockchain.zincir = [genesisBlok];
  fs.writeFileSync('zincir.json', JSON.stringify(blockchain, null, 2));
  console.log('Genesis blok oluşturuldu ve zincir.json dosyasına kaydedildi.');
}

if (require.main === module) {
  kullanicilariOlustur();
}