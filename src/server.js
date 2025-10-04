const express = require('express');
const bodyParser = require('body-parser');
const { ec } = require('elliptic');
const fs = require('fs');
const { BlokZinciri, Islem } = require('./blockchain');

const app = express();
const elliptic = new ec('secp256k1');
const port = 3000;

const data = fs.readFileSync('zincir.json');
const blockchain = BlokZinciri.fromJSON(JSON.parse(data));

app.use(bodyParser.json());
app.use(require('cors')());

app.get('/api/kullanici-dogrula', (req, res) => {
    const gelenPublicKey = req.query.publicKey;
    
    if (!gelenPublicKey) {
        return res.status(400).json({ hata: 'publicKey gerekli' });
    }

    try {
        const kullanicilar = JSON.parse(fs.readFileSync('kullanicilar.json', 'utf8'));
        const kullaniciVarmi = kullanicilar.some(k => {
            const dosyadakiPublicKey = k.publicKey.trim().toLowerCase();
            const eslesenPublicKey = gelenPublicKey.trim().toLowerCase();
            return dosyadakiPublicKey === eslesenPublicKey;
        });

        if (kullaniciVarmi) {
            res.json({ mesaj: 'Kullanıcı doğrulandı', dogrulandi: true });
        } else {
            res.status(404).json({ hata: 'Kullanıcı bulunamadı', dogrulandi: false });
        }
    } catch (error) {
        console.error('Dosya okuma veya JSON parse hatası:', error.message);
        res.status(500).json({ hata: 'Sunucu hatası', mesaj: 'Kullanıcı verisi okunamadı.' });
    }
});

app.get('/api/bakiye', (req, res) => {
    const adres = req.query.adres;
    if (!adres) return res.status(400).json({ hata: 'Adres gerekli' });
    const bakiye = blockchain.adresinOnaylanmisBakiyesi(adres);
    res.json({ bakiye });
});

app.post('/api/gonder-imzali', (req, res) => {
    const { gonderenAdres, aliciAdres, miktar, ucret, zamanDamgasi, imza } = req.body;
    if (!gonderenAdres || !aliciAdres || miktar == null || !imza) {
        return res.status(400).json({ hata: 'Eksik parametreler: İşlem tam olarak gönderilmedi.' });
    }

    try {
        const guncelKullanicilar = JSON.parse(fs.readFileSync('kullanicilar.json', 'utf8'));

        // Alıcı adresinin varlığını kontrol et
        const aliciIndex = guncelKullanicilar.findIndex(k => k.publicKey.trim().toLowerCase() === aliciAdres.trim().toLowerCase());
        if (aliciIndex === -1) {
            return res.status(400).json({ hata: 'Alıcı adresi geçersiz veya bulunamadı.' });
        }

        const islem = new Islem(gonderenAdres, aliciAdres, miktar, ucret);
        islem.zamanDamgasi = zamanDamgasi;
        islem.imza = imza;

        // Burada imzanın geçerliliğini kontrol etmelisiniz
        if (!islem.gecerliMi()) {
            return res.status(400).json({ hata: 'İşlem imzası geçerli değil veya gönderen adresi hatalı.' });
        }
        blockchain.islemEkle(islem);
        
        const rastgeleMadenciIndex = Math.floor(Math.random() * guncelKullanicilar.length);
        const madenciAdresi = guncelKullanicilar[rastgeleMadenciIndex].publicKey;

        let gonderenIndex = guncelKullanicilar.findIndex(k => k.publicKey.trim().toLowerCase() === gonderenAdres.trim().toLowerCase());
        
        // Bu noktadan sonra aliciIndex'in -1 olamayacağını biliyoruz.
        const madenciIndex = guncelKullanicilar.findIndex(k => k.publicKey.trim().toLowerCase() === madenciAdresi.trim().toLowerCase());

        if (gonderenIndex !== -1) {
            const yeniBakiye = blockchain.adresinOnaylanmisBakiyesi(gonderenAdres);
            guncelKullanicilar[gonderenIndex].bakiye = yeniBakiye;
        }
        if (aliciIndex !== -1) {
            const yeniBakiye = blockchain.adresinOnaylanmisBakiyesi(aliciAdres);
            guncelKullanicilar[aliciIndex].bakiye = yeniBakiye;
        }
        if (madenciIndex !== -1) {
            const yeniBakiye = blockchain.adresinOnaylanmisBakiyesi(madenciAdresi);
            guncelKullanicilar[madenciIndex].bakiye = yeniBakiye;
        }

        fs.writeFileSync('kullanicilar.json', JSON.stringify(guncelKullanicilar, null, 2));

        res.json({ mesaj: 'İşlem başarıyla doğrulandı ve zincire eklendi' });
    } catch (err) {
        console.error("İşlem sırasında bir hata oluştu:", err);
        res.status(500).json({ hata: 'İşlem sırasında bir hata oluştu: ' + err.message });
    }
});

//#region
 // Madencilik işlemi başlatılmadan önce bir bayrak tanımlıyoruz
let islemYok = true;
// Madencilik işlemini düzenli aralıklarla yapmak için setInterval kullanıyoruz.
// Örneğin, her 15 saniyede bir yeni bir blok üretmeye çalışacak.
setInterval(() => {
    // Sadece bekleyen işlemler varsa madencilik yap
    if (blockchain.bekleyenIslemler.length > 0) {
        console.log('Madencilik işlemi başlatılıyor...');

        const guncelKullanicilar = JSON.parse(fs.readFileSync('kullanicilar.json', 'utf8'));
        const rastgeleMadenciIndex = Math.floor(Math.random() * guncelKullanicilar.length);
        const madenciAdresi = guncelKullanicilar[rastgeleMadenciIndex].publicKey;

        // Bekleyen tüm işlemleri madencilik yap ve yeni blok oluştur
        blockchain.bekleyenIslemleriMineEt(madenciAdresi);
        
        // Madencilik sonrası blok zincirini dosyaya kaydet
        fs.writeFileSync('zincir.json', JSON.stringify(blockchain, null, 2));

        console.log('Yeni blok madenciliği tamamlandı ve zincire eklendi.');

        // Kullanıcıların bakiyelerini güncelle
        // Burada `gonderenAdres`, `aliciAdres` gibi değişkenler olmadığı için 
        // tüm kullanıcıların bakiyelerini güncellemek daha doğru olur.
        guncelKullanicilar.forEach(kullanici => {
            kullanici.bakiye = blockchain.adresinOnaylanmisBakiyesi(kullanici.publicKey);
        });
        fs.writeFileSync('kullanicilar.json', JSON.stringify(guncelKullanicilar, null, 2));

    } else {
        // Eğer bekleyen işlem yoksa ve daha önce bu mesajı yazdırmadıysak
        if (!islemYok) {
            console.log('Bekleyen işlem yok, madencilik yapılmadı.');
            // Mesajı bir daha yazdırmamak için bayrağı ayarla
            islemYok = true;
        }
    }
}, 15000); // 15000 milisaniye = 15 saniye

//#endregion

app.listen(port, () => {
    console.log(`API çalışıyor: http://localhost:${port}`);
});