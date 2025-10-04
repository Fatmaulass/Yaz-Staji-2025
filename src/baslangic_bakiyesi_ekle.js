const { Islem } = require('./blockchain');
const fs = require('fs');
function baslangicBakiyeleriniEkle(blokZinciri, kullanicilarDosyasiYolu) {
  const kullanicilar = JSON.parse(fs.readFileSync(kullanicilarDosyasiYolu, 'utf-8'));
  kullanicilar.forEach(kullanici => {
    const islem = new Islem(null, kullanici.publicKey, kullanici.bakiye);
    blokZinciri.islemEkle(islem);
  });
}
module.exports = { baslangicBakiyeleriniEkle };


//TODO kullanıcı giriş yapabilecek 
// bakiyesini görücek 
// para gönderme işlemi yapabilecek  
//kendi adresini de bilicek çünkü para göndermesi için bu lazım