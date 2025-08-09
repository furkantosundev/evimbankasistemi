// Para formatı
function formatTL(sayi) {
    return new Intl.NumberFormat('tr-TR', { 
        style: 'currency', 
        currency: 'TRY',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(sayi);
}

// PMT hesaplama (Banka kredisi taksit)
function pmtHesapla(kredi, aylikFaiz, vade) {
    const r = aylikFaiz / 100;
    if (r === 0) return kredi / vade;
    return kredi * r * Math.pow(1 + r, vade) / (Math.pow(1 + r, vade) - 1);
}

// Repo kaybı hesaplama
function repoKaybiHesapla(miktar, sure, netFaiz) {
    return miktar * Math.pow(1 + netFaiz, sure) - miktar;
}

// Evim sabit taksit
function evimSabitTaksit(toplamOdenecek, vade) {
    return toplamOdenecek / vade;
}

// Evim artışlı taksit hesaplama
function evimArtisliTaksit(toplamOdenecek, finansman, vade) {
    // Her 6 ayda finansman × ‰6 artış
    const artis = finansman * 0.006;
    const donemSayisi = Math.ceil(vade / 6);
    
    // İlk taksiti bulmak için formül:
    // Toplam = (ilk 6 ay × ilkTaksit) + (ikinci 6 ay × (ilkTaksit + artis)) + ...
    let toplamKatsayi = 0;
    let artisKatsayi = 0;
    
    for (let donem = 0; donem < donemSayisi; donem++) {
        const ayBaslangic = donem * 6;
        const ayBitis = Math.min((donem + 1) * 6, vade);
        const aySayisi = ayBitis - ayBaslangic;
        
        toplamKatsayi += aySayisi;
        artisKatsayi += aySayisi * donem;
    }
    
    const ilkTaksit = (toplamOdenecek - artis * artisKatsayi) / toplamKatsayi;
    return { ilkTaksit, artis };
}

// Kira geliri hesaplama
function kiraGeliriHesapla(evDegeri, evAlimAyi, aylikEnflasyon, amortismanSuresi) {
    let toplamKayipKira = 0;
    let mevcutEvDegeri = evDegeri;
    
    // Her yıl için kira gelirini hesapla
    for (let ay = 1; ay <= evAlimAyi; ay++) {
        // Her 12 ayda bir ev değerini güncelle
        if (ay > 1 && (ay - 1) % 12 === 0) {
            mevcutEvDegeri = evDegeri * Math.pow(1 + aylikEnflasyon / 100, ay - 1);
        }
        
        // Aylık kira = Ev değeri / Amortisman süresi
        const aylikKira = mevcutEvDegeri / amortismanSuresi;
        toplamKayipKira += aylikKira;
    }
    
    return toplamKayipKira;
}

// Banka kredisi hesaplama
function bankaKredisiHesapla(params) {
    const { evBedeli, maxPesinat, maxAylikOdeme, bankaFaizi } = params;
    const vadeler = [12, 18, 24, 36, 48, 60, 72, 84, 96, 108, 120];
    let enIyiSonuc = null;
    let tumVadeler = [];
    
    for (const vade of vadeler) {
        const minPesinat = evBedeli * 0.30; // %30 minimum
        const pesinat = Math.max(minPesinat, Math.min(maxPesinat, evBedeli * 0.50));
        const krediTutari = evBedeli - pesinat;
        
        const aylikTaksit = pmtHesapla(krediTutari, bankaFaizi, vade);
        
        const toplamOdeme = (aylikTaksit * vade) + pesinat;
        const toplamFaiz = toplamOdeme - evBedeli;
        
        tumVadeler.push({
            vade,
            pesinat,
            krediTutari,
            aylikTaksit,
            toplamFaiz,
            toplamMaliyet: toplamOdeme,
            uygun: aylikTaksit <= maxAylikOdeme
        });
        
        if (aylikTaksit <= maxAylikOdeme) {
            if (!enIyiSonuc || toplamOdeme < enIyiSonuc.toplamMaliyet) {
                enIyiSonuc = {
                    vade,
                    pesinat,
                    krediTutari,
                    aylikTaksit,
                    toplamFaiz,
                    toplamMaliyet: toplamOdeme
                };
            }
        }
    }
    
    if (enIyiSonuc) {
        enIyiSonuc.tumVadeler = tumVadeler;
    }
    
    return enIyiSonuc;
}

// Evim sistemi optimal strateji bulma
function evimOptimalBul(params) {
    const { 
        evBedeli, maxPesinat, maxAylikOdeme, 
        aylikEvEnflasyonu, aylikRepoFaizi, repoVergiOrani,
        orgBedeli, aylikKira, evimTaksitArtisi, repoKaybiDahil
    } = params;
    
    const netRepoFaizi = (aylikRepoFaizi / 100) * (1 - repoVergiOrani / 100);
    let enIyiSonuc = null;
    let alternatifStratejiler = [];
    
    // Debug için
    console.log("Evim sistemi hesaplama başlıyor...");
    console.log("Parametreler:", params);
    
    // Önce maksimum ödeme bazlı stratejiyi dene
    for (let pesinat = 0; pesinat <= maxPesinat; pesinat += 50000) {
        // En erken ne zaman ev alabiliriz?
        for (let evAlimAyi = 5; evAlimAyi <= 24; evAlimAyi++) {
            // Ev fiyatı hesapla
            const evFiyatiAlim = evBedeli * Math.pow(1 + aylikEvEnflasyonu / 100, evAlimAyi);
            const finansman = evFiyatiAlim;
            const orgTutari = finansman * (orgBedeli / 100);
            const toplamOdenecek = finansman + orgTutari;
            
            // %40 barajı
            const kirkBaraji = finansman * 0.40;
            
            // Maksimum ödeme ile bu ayda %40'ı geçebilir miyiz?
            const evAlimKadarOdeme = pesinat + (evAlimAyi * maxAylikOdeme);
            
            if (evAlimKadarOdeme >= kirkBaraji) {
                // Evet! Gereken vadeyi hesapla
                const kalanBorc = toplamOdenecek - evAlimKadarOdeme;
                const kalanVade = Math.ceil(kalanBorc / maxAylikOdeme);
                const toplamVade = evAlimAyi + kalanVade;
                
                // Sabit taksit hesapla (maksimum ödemeye yakın)
                const gercekTaksit = (toplamOdenecek - pesinat) / toplamVade;
                
                // Taksit uygun mu?
                if (gercekTaksit > maxAylikOdeme || gercekTaksit <= 0) {
                    continue;
                }
                
                // Maliyet hesaplama
                let toplamMaliyet = toplamOdenecek;
                
                // Repo kaybı hesaplaması (isteğe bağlı)
                let pesinatRepoKaybi = 0;
                let taksitRepoKaybi = 0;
                
                if (repoKaybiDahil) {
                    pesinatRepoKaybi = repoKaybiHesapla(pesinat, evAlimAyi, netRepoFaizi);
                    toplamMaliyet += pesinatRepoKaybi;
                    
                    for (let ay = 1; ay <= evAlimAyi; ay++) {
                        const kalanSure = evAlimAyi - ay;
                        const buTaksitinRepoGetirisi = repoKaybiHesapla(gercekTaksit, kalanSure, netRepoFaizi);
                        taksitRepoKaybi += buTaksitinRepoGetirisi;
                    }
                    toplamMaliyet += taksitRepoKaybi;
                }
                
                // Kaybedilen kira geliri
                const kayipKiraGeliri = kiraGeliriHesapla(evBedeli, evAlimAyi, aylikEvEnflasyonu, params.kiraAmortismanSuresi);
                toplamMaliyet += kayipKiraGeliri;
                
                // Kira gideri
                const kiraGideri = aylikKira * evAlimAyi;
                toplamMaliyet += kiraGideri;
                
                const strateji = {
                    pesinat,
                    evAlimAyi,
                    evFiyatiAlim,
                    finansman,
                    orgTutari,
                    toplamOdenecek,
                    ilkTaksit: gercekTaksit,
                    taksitArtis: 0,
                    kalanVade,
                    toplamVade,
                    pesinatRepoKaybi,
                    taksitRepoKaybi,
                    kayipKiraGeliri,
                    kiraGideri,
                    toplamMaliyet
                };
                
                // En iyi stratejileri sakla
                alternatifStratejiler.push(strateji);
                alternatifStratejiler.sort((a, b) => a.toplamMaliyet - b.toplamMaliyet);
                if (alternatifStratejiler.length > 5) {
                    alternatifStratejiler = alternatifStratejiler.slice(0, 5);
                }
                
                if (!enIyiSonuc || toplamMaliyet < enIyiSonuc.toplamMaliyet) {
                    enIyiSonuc = strateji;
                }
                
                // Bu ev alım ayı için en iyi stratejiyi bulduk, sonrakine geç
                break;
            }
        }
    }
    
    // Sonra mevcut vade bazlı stratejiyi dene
    for (let pesinat = 0; pesinat <= maxPesinat; pesinat += 50000) {
        for (let toplamVade = 12; toplamVade <= 120; toplamVade += 6) {
            // Ev fiyatını başlangıçta belirleyelim (optimizasyon için)
            const tahminiEvFiyati = evBedeli * Math.pow(1 + aylikEvEnflasyonu / 100, 12);
            const tahminiFinansman = tahminiEvFiyati;
            const tahminiOrgTutari = tahminiFinansman * (orgBedeli / 100);
            const tahminiToplamOdenecek = tahminiFinansman + tahminiOrgTutari;
            const tahminiToplamBorc = tahminiToplamOdenecek - pesinat;
            
            // Bu vade ve peşinatla taksit hesapla
            let ilkTaksit, taksitArtis = 0;
            if (evimTaksitArtisi) {
                const artisliSonuc = evimArtisliTaksit(tahminiToplamBorc, tahminiFinansman, toplamVade);
                ilkTaksit = artisliSonuc.ilkTaksit;
                taksitArtis = artisliSonuc.artis;
            } else {
                ilkTaksit = evimSabitTaksit(tahminiToplamBorc, toplamVade);
            }
            
            // İlk taksit uygun değilse veya negatifse devam et
            if (ilkTaksit > maxAylikOdeme || ilkTaksit <= 0) {
                continue;
            }
            
            // %40 barajını ne zaman geçeriz?
            const kirkBaraji = tahminiFinansman * 0.40;
            let toplamOdeme = pesinat;
            let tahminTaksit = ilkTaksit;
            let kirkBarajGecisAyi = 0;
            
            for (let ay = 1; ay <= toplamVade; ay++) {
                if (evimTaksitArtisi && ay > 1 && (ay - 1) % 6 === 0) {
                    tahminTaksit += taksitArtis;
                }
                toplamOdeme += tahminTaksit;
                
                if (toplamOdeme >= kirkBaraji && kirkBarajGecisAyi === 0) {
                    kirkBarajGecisAyi = ay;
                    break;
                }
            }
            
            // %40 barajını geçemiyorsak devam et
            if (kirkBarajGecisAyi === 0) {
                continue;
            }
            
            // Ev alım ayı: %40 barajını geçtikten sonra veya minimum 5. ay
            // Maksimum 24 ay sınırı
            const evAlimAyi = Math.max(5, Math.min(24, kirkBarajGecisAyi));
            
            // Gerçek ev fiyatını hesapla
            const evFiyatiAlim = evBedeli * Math.pow(1 + aylikEvEnflasyonu / 100, evAlimAyi);
            const finansman = evFiyatiAlim;
            const orgTutari = finansman * (orgBedeli / 100);
            const toplamOdenecek = finansman + orgTutari;
            const toplamBorc = toplamOdenecek - pesinat;
            
            // Gerçek taksit hesabı yapmalıyız
            const realToplamBorc = toplamOdenecek - pesinat;
            let realIlkTaksit, realTaksitArtis = 0;
            
            if (evimTaksitArtisi) {
                const artisliSonuc = evimArtisliTaksit(realToplamBorc, finansman, toplamVade);
                realIlkTaksit = artisliSonuc.ilkTaksit;
                realTaksitArtis = artisliSonuc.artis;
            } else {
                realIlkTaksit = evimSabitTaksit(realToplamBorc, toplamVade);
            }
            
            // Gerçek ilk taksit uygun değilse veya negatifse devam et
            if (realIlkTaksit > maxAylikOdeme || realIlkTaksit <= 0) {
                continue;
            }
            
            // Gerçek %40 barajını kontrol et
            const realKirkBaraji = finansman * 0.40;
            let realToplamOdeme = pesinat;
            let realMevcutTaksit = realIlkTaksit;
            let realKirkBarajGecisAyi = 0;
            
            for (let ay = 1; ay <= toplamVade; ay++) {
                if (evimTaksitArtisi && ay > 1 && (ay - 1) % 6 === 0) {
                    realMevcutTaksit += realTaksitArtis;
                }
                realToplamOdeme += realMevcutTaksit;
                
                if (realToplamOdeme >= realKirkBaraji && realKirkBarajGecisAyi === 0) {
                    realKirkBarajGecisAyi = ay;
                    break;
                }
            }
            
            // Gerçek ev alım ayını belirle
            // Maksimum 24 ay sınırı
            const gercekEvAlimAyi = Math.max(5, Math.min(24, realKirkBarajGecisAyi));
            
            // Ev alındıktan sonra kalan vade
            const kalanVade = toplamVade - gercekEvAlimAyi;
            
            // Maliyet hesaplama
            let toplamMaliyet = toplamOdenecek;
            
            // Repo kaybı hesaplaması (isteğe bağlı)
            let pesinatRepoKaybi = 0;
            let taksitRepoKaybi = 0;
            
            if (repoKaybiDahil) {
                // Peşinat repo kaybı (ev alınana kadar)
                pesinatRepoKaybi = repoKaybiHesapla(pesinat, gercekEvAlimAyi, netRepoFaizi);
                toplamMaliyet += pesinatRepoKaybi;
                
                // Taksitlerin repo kaybı
                // Sadece ev alınana kadar ödenen taksitlerin repo getirisi hesaplanacak
                let repoTaksit = realIlkTaksit;
                
                for (let ay = 1; ay <= gercekEvAlimAyi; ay++) {
                    // Taksit artışı kontrolü
                    if (evimTaksitArtisi && ay > 1 && (ay - 1) % 6 === 0) {
                        repoTaksit += realTaksitArtis;
                    }
                    
                    // Bu taksiti repoya yatırsaydık ev alımına kadar ne kadar getiri elde ederdik?
                    const kalanSure = gercekEvAlimAyi - ay;
                    const buTaksitinRepoGetirisi = repoKaybiHesapla(repoTaksit, kalanSure, netRepoFaizi);
                    taksitRepoKaybi += buTaksitinRepoGetirisi;
                }
                
                toplamMaliyet += taksitRepoKaybi;
            }
            
            // Kaybedilen kira geliri (ev alınana kadar)
            // Evim sisteminde ev elinize geçene kadar kira geliri elde edemezsiniz
            // Oysa banka kredisinde hemen ev sahibi olup kiraya verebilirsiniz
            const kayipKiraGeliri = kiraGeliriHesapla(evBedeli, gercekEvAlimAyi, aylikEvEnflasyonu, params.kiraAmortismanSuresi);
            toplamMaliyet += kayipKiraGeliri;
            
            // Kira gideri (eğer kiracıysanız)
            const kiraGideri = aylikKira * gercekEvAlimAyi;
            toplamMaliyet += kiraGideri;
            
            const strateji = {
                pesinat,
                evAlimAyi: gercekEvAlimAyi,
                evFiyatiAlim,
                finansman,
                orgTutari,
                toplamOdenecek,
                ilkTaksit: realIlkTaksit,
                taksitArtis: realTaksitArtis,
                kalanVade,
                toplamVade,
                pesinatRepoKaybi,
                taksitRepoKaybi,
                kayipKiraGeliri,
                kiraGideri,
                toplamMaliyet
            };
            
            // En iyi 5 stratejiyi sakla
            alternatifStratejiler.push(strateji);
            alternatifStratejiler.sort((a, b) => a.toplamMaliyet - b.toplamMaliyet);
            if (alternatifStratejiler.length > 5) {
                alternatifStratejiler = alternatifStratejiler.slice(0, 5);
            }
            
            console.log(`Strateji bulundu - Peşinat: ${pesinat}, Ev alım: ${gercekEvAlimAyi}. ay, Vade: ${toplamVade}, Maliyet: ${toplamMaliyet}`);
            
            // En iyi sonucu güncelle
            if (!enIyiSonuc || toplamMaliyet < enIyiSonuc.toplamMaliyet) {
                enIyiSonuc = {
                    pesinat,
                    evAlimAyi: gercekEvAlimAyi,
                    evFiyatiAlim,
                    finansman,
                    orgTutari,
                    toplamOdenecek,
                    ilkTaksit: realIlkTaksit,
                    taksitArtis: realTaksitArtis,
                    kalanVade,
                    toplamVade,
                    pesinatRepoKaybi,
                    taksitRepoKaybi,
                    kayipKiraGeliri,
                    kiraGideri,
                    toplamMaliyet
                };
            }
        }
    }
    
    if (!enIyiSonuc) {
        console.log("Hiçbir uygun strateji bulunamadı!");
    } else {
        enIyiSonuc.alternatifStratejiler = alternatifStratejiler;
    }
    
    return enIyiSonuc;
}

// Ana hesaplama fonksiyonu
function hesapla(e) {
    e.preventDefault();
    
    // Form verilerini al
    const params = {
        evBedeli: temizleSayi(document.getElementById('evBedeli').value),
        maxPesinat: temizleSayi(document.getElementById('maxPesinat').value),
        maxAylikOdeme: temizleSayi(document.getElementById('maxAylikOdeme').value),
        aylikKira: 0, // Kira kaldırıldı
        aylikEvEnflasyonu: parseFloat(document.getElementById('aylikEvEnflasyonu').value),
        aylikRepoFaizi: parseFloat(document.getElementById('aylikRepoFaizi').value),
        repoVergiOrani: parseFloat(document.getElementById('repoVergiOrani').value),
        bankaFaizi: parseFloat(document.getElementById('bankaFaizi').value),
        orgBedeli: parseFloat(document.getElementById('orgBedeli').value),
        evimTaksitArtisi: document.getElementById('evimTaksitArtisi').checked,
        repoKaybiDahil: document.getElementById('repoKaybiDahil').checked,
        kiraAmortismanSuresi: temizleSayi(document.getElementById('kiraAmortismanSuresi').value)
    };
    
    // Hesaplamaları yap
    const bankaSonuc = bankaKredisiHesapla(params);
    const evimSonuc = evimOptimalBul(params);
    
    // Sonuçları göster
    gosterBankaSonuc(bankaSonuc);
    gosterEvimSonuc(evimSonuc);
    gosterKarsilastirma(bankaSonuc, evimSonuc);
    
    // Sonuç alanını göster
    document.getElementById('sonuclar').style.display = 'block';
}

// Banka sonucunu göster
function gosterBankaSonuc(sonuc) {
    if (!sonuc) {
        document.getElementById('bankaSonuc').innerHTML = '<p>Uygun kredi bulunamadı.</p>';
        return;
    }
    
    // İlk 12 aylık ödeme planı hesapla
    let odemePlani = [];
    let kalanBorc = sonuc.krediTutari;
    const aylikFaizOrani = parseFloat(document.getElementById('bankaFaizi').value) / 100;
    
    for (let ay = 1; ay <= Math.min(12, sonuc.vade); ay++) {
        const faizOdemesi = kalanBorc * aylikFaizOrani;
        const anaparaOdemesi = sonuc.aylikTaksit - faizOdemesi;
        kalanBorc -= anaparaOdemesi;
        
        odemePlani.push({
            ay,
            taksit: sonuc.aylikTaksit,
            faiz: faizOdemesi,
            anapara: anaparaOdemesi,
            kalanBorc
        });
    }
    
    const html = `
        <div class="sonuc-item">
            <strong>En Uygun Vade:</strong>
            <span class="deger">${sonuc.vade} ay</span>
        </div>
        <div class="sonuc-item">
            <strong>Peşinat:</strong>
            <span class="deger">${formatTL(sonuc.pesinat)}</span>
        </div>
        <div class="sonuc-item">
            <strong>Kredi Tutarı:</strong>
            <span class="deger">${formatTL(sonuc.krediTutari)}</span>
        </div>
        <div class="sonuc-item">
            <strong>Aylık Taksit:</strong>
            <span class="deger">${formatTL(sonuc.aylikTaksit)}</span>
        </div>
        <div class="sonuc-item">
            <strong>Toplam Faiz:</strong>
            <span class="deger">${formatTL(sonuc.toplamFaiz)}</span>
        </div>
        <div class="sonuc-item toplam-maliyet">
            <strong>TOPLAM MALİYET:</strong>
            <span class="deger">${formatTL(sonuc.toplamMaliyet)}</span>
        </div>
        
        <button class="toggle-detay" onclick="toggleDetay('bankaDetay')">Detayları Göster</button>
        
        <div id="bankaDetay" class="detay-alan">
            <h4 class="detay-baslik">Hesaplama Detayları</h4>
            
            <div class="aciklama-kutu">
                <strong>Kredi Hesaplaması:</strong><br>
                Ev Bedeli: ${formatTL(temizleSayi(document.getElementById('evBedeli').value))}<br>
                Peşinat: ${formatTL(sonuc.pesinat)} (%${(sonuc.pesinat / temizleSayi(document.getElementById('evBedeli').value) * 100).toFixed(0)})<br>
                Kredi Tutarı: ${formatTL(sonuc.krediTutari)}<br>
                Aylık Faiz: %${parseFloat(document.getElementById('bankaFaizi').value)}<br>
                Toplam Ödeme: ${formatTL(sonuc.pesinat + sonuc.aylikTaksit * sonuc.vade)}
            </div>
            
            <h4 class="detay-baslik">İlk 12 Aylık Ödeme Planı</h4>
            <table class="detay-tablo">
                <thead>
                    <tr>
                        <th>Ay</th>
                        <th>Taksit</th>
                        <th>Faiz</th>
                        <th>Anapara</th>
                        <th>Kalan Borç</th>
                    </tr>
                </thead>
                <tbody>
                    ${odemePlani.map(odeme => `
                        <tr>
                            <td>${odeme.ay}</td>
                            <td>${formatTL(odeme.taksit)}</td>
                            <td>${formatTL(odeme.faiz)}</td>
                            <td>${formatTL(odeme.anapara)}</td>
                            <td>${formatTL(odeme.kalanBorc)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            
            <h4 class="detay-baslik">Tüm Vade Seçenekleri</h4>
            <table class="detay-tablo">
                <thead>
                    <tr>
                        <th>Vade</th>
                        <th>Aylık Taksit</th>
                        <th>Toplam Faiz</th>
                        <th>Toplam Maliyet</th>
                        <th>Durum</th>
                    </tr>
                </thead>
                <tbody>
                    ${sonuc.tumVadeler.map(vade => `
                        <tr ${vade.vade === sonuc.vade ? 'style="background-color: #d4edda; font-weight: bold;"' : 
                             !vade.uygun ? 'style="opacity: 0.5;"' : ''}>
                            <td>${vade.vade} ay</td>
                            <td>${formatTL(vade.aylikTaksit)}</td>
                            <td>${formatTL(vade.toplamFaiz)}</td>
                            <td>${formatTL(vade.toplamMaliyet)}</td>
                            <td>${vade.vade === sonuc.vade ? '✓ Seçilen' : 
                                 !vade.uygun ? 'Taksit yüksek' : ''}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            
            <div class="aciklama-kutu" style="margin-top: 15px;">
                <strong>Not:</strong> Yeşil satır en uygun vadeyi gösterir. Gri satırlar aylık ödeme kapasitenizi aşan vadeleri gösterir.
            </div>
        </div>
    `;
    
    document.getElementById('bankaSonuc').innerHTML = html;
}

// Evim sonucunu göster
function gosterEvimSonuc(sonuc) {
    if (!sonuc) {
        document.getElementById('evimSonuc').innerHTML = '<p>Uygun strateji bulunamadı.</p>';
        return;
    }
    
    let taksitBilgi = sonuc.taksitArtis > 0 
        ? `${formatTL(sonuc.ilkTaksit)} (Her 6 ayda ${formatTL(sonuc.taksitArtis)} artış)`
        : formatTL(sonuc.ilkTaksit);
    
    // %40 baraj hesabı
    const evBedeli = temizleSayi(document.getElementById('evBedeli').value);
    const kirkBaraji = sonuc.finansman * 0.40;
    
    // İlk aylardaki ödemeler
    let odemeler = [];
    let toplamOdeme = sonuc.pesinat;
    let mevcutTaksit = sonuc.ilkTaksit;
    let kirkBarajGecildi = false;
    
    for (let ay = 1; ay <= Math.min(12, sonuc.evAlimAyi); ay++) {
        if (sonuc.taksitArtis > 0 && ay > 1 && (ay - 1) % 6 === 0) {
            mevcutTaksit += sonuc.taksitArtis;
        }
        toplamOdeme += mevcutTaksit;
        
        if (!kirkBarajGecildi && toplamOdeme >= kirkBaraji) {
            kirkBarajGecildi = ay;
        }
        
        odemeler.push({
            ay,
            taksit: mevcutTaksit,
            toplamOdeme,
            yuzde: (toplamOdeme / sonuc.finansman * 100).toFixed(1)
        });
    }
    
    const html = `
        <div class="sonuc-item">
            <strong>Optimal Strateji:</strong>
            <span class="deger">${sonuc.evAlimAyi}. ayda ev alımı</span>
        </div>
        <div class="sonuc-item">
            <strong>Peşinat:</strong>
            <span class="deger">${formatTL(sonuc.pesinat)}</span>
        </div>
        <div class="sonuc-item">
            <strong>Ev Fiyatı (${sonuc.evAlimAyi}. ay):</strong>
            <span class="deger">${formatTL(sonuc.evFiyatiAlim)} (+%${((sonuc.evFiyatiAlim / evBedeli - 1) * 100).toFixed(1)})</span>
        </div>
        <div class="sonuc-item">
            <strong>Organizasyon Bedeli:</strong>
            <span class="deger">${formatTL(sonuc.orgTutari)}</span>
        </div>
        <div class="sonuc-item">
            <strong>İlk Taksit:</strong>
            <span class="deger">${taksitBilgi}</span>
        </div>
        <div class="sonuc-item">
            <strong>Toplam Vade:</strong>
            <span class="deger">${sonuc.toplamVade} ay</span>
        </div>
        
        <h4 style="margin-top: 20px; margin-bottom: 10px;">Maliyet Detayı:</h4>
        <div class="sonuc-item">
            <strong>Başlangıç Ev Bedeli:</strong>
            <span class="deger">${formatTL(evBedeli)}</span>
        </div>
        <div class="sonuc-item">
            <strong>Ev Fiyat Artışı (${sonuc.evAlimAyi} ay):</strong>
            <span class="deger">${formatTL(sonuc.evFiyatiAlim - evBedeli)}</span>
        </div>
        <div class="sonuc-item">
            <strong>Organizasyon Bedeli:</strong>
            <span class="deger">${formatTL(sonuc.orgTutari)}</span>
        </div>
        <div class="sonuc-item" style="border-top: 1px solid #ddd; padding-top: 8px;">
            <strong>Ödenen Ana Tutar:</strong>
            <span class="deger">${formatTL(sonuc.toplamOdenecek)}</span>
        </div>
        ${(sonuc.pesinatRepoKaybi > 0 || sonuc.taksitRepoKaybi > 0) ? `
        <div class="sonuc-item">
            <strong>Repo Kaybı:</strong>
            <span class="deger">${formatTL(sonuc.pesinatRepoKaybi + sonuc.taksitRepoKaybi)}</span>
        </div>` : ''}
        <div class="sonuc-item">
            <strong>Kaybedilen Kira Geliri (${sonuc.evAlimAyi} ay):</strong>
            <span class="deger">${formatTL(sonuc.kayipKiraGeliri)}</span>
        </div>
        ${sonuc.kiraGideri > 0 ? `
        <div class="sonuc-item">
            <strong>Kira Gideri (${sonuc.evAlimAyi} ay):</strong>
            <span class="deger">${formatTL(sonuc.kiraGideri)}</span>
        </div>` : ''}
        <div class="sonuc-item toplam-maliyet">
            <strong>TOPLAM MALİYET:</strong>
            <span class="deger">${formatTL(sonuc.toplamMaliyet)}</span>
        </div>
        
        <button class="toggle-detay" onclick="toggleDetay('evimDetay')">Detayları Göster</button>
        
        <div id="evimDetay" class="detay-alan">
            <h4 class="detay-baslik">Hesaplama Detayları</h4>
            
            <div class="aciklama-kutu">
                <strong>%40 Barajı Hesabı:</strong><br>
                Başlangıç Ev Bedeli: ${formatTL(evBedeli)}<br>
                ${sonuc.evAlimAyi}. ay Ev Bedeli: ${formatTL(sonuc.evFiyatiAlim)}<br>
                Finansman Tutarı: ${formatTL(sonuc.finansman)}<br>
                %40 Barajı: ${formatTL(kirkBaraji)}<br>
                ${kirkBarajGecildi ? `%40 barajı ${kirkBarajGecildi}. ayda geçildi` : ''}
            </div>
            
            ${(sonuc.pesinatRepoKaybi > 0 || sonuc.taksitRepoKaybi > 0) ? `
            <div class="aciklama-kutu">
                <strong>Repo Kaybı Açıklaması:</strong><br>
                Peşinat Repo Kaybı: ${formatTL(sonuc.pesinat)} × ${sonuc.evAlimAyi} ay = ${formatTL(sonuc.pesinatRepoKaybi)}<br>
                Taksit Repo Kaybı: İlk ${sonuc.evAlimAyi} aylık taksitlerin repo getirisi = ${formatTL(sonuc.taksitRepoKaybi)}<br>
                <small>Not: Sadece ev alınana kadar olan dönem için hesaplanır</small>
            </div>` : `
            <div class="aciklama-kutu">
                <strong>Repo Kaybı:</strong><br>
                Repo kaybı hesaplaması devre dışı bırakıldı.
            </div>`}
            
            <div class="aciklama-kutu">
                <strong>Kira Geliri Kaybı:</strong><br>
                Evim sisteminde ${sonuc.evAlimAyi} ay boyunca kira geliri elde edilemez.<br>
                Kira hesaplaması: Ev değeri / ${temizleSayi(document.getElementById('kiraAmortismanSuresi').value)} ay<br>
                - İlk 12 ay: ${formatTL(evBedeli)} / ${temizleSayi(document.getElementById('kiraAmortismanSuresi').value)} = ${formatTL(evBedeli / temizleSayi(document.getElementById('kiraAmortismanSuresi').value))}/ay<br>
                ${sonuc.evAlimAyi > 12 ? `- Sonraki aylar: Yıllık güncellenen ev değeri üzerinden<br>` : ''}
                Toplam kayıp: ${formatTL(sonuc.kayipKiraGeliri)}
            </div>
            
            <h4 class="detay-baslik">İlk 12 Aylık Ödeme Planı</h4>
            <table class="detay-tablo">
                <thead>
                    <tr>
                        <th>Ay</th>
                        <th>Aylık Taksit</th>
                        <th>Toplam Ödeme</th>
                        <th>Ödeme Yüzdesi</th>
                    </tr>
                </thead>
                <tbody>
                    ${odemeler.map(odeme => `
                        <tr ${odeme.yuzde >= 40 ? 'style="background-color: #d4edda;"' : ''}>
                            <td>${odeme.ay}</td>
                            <td>${formatTL(odeme.taksit)}</td>
                            <td>${formatTL(odeme.toplamOdeme)}</td>
                            <td>%${odeme.yuzde}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            
            ${sonuc.alternatifStratejiler && sonuc.alternatifStratejiler.length > 1 ? `
            <h4 class="detay-baslik">Alternatif Stratejiler</h4>
            <table class="detay-tablo">
                <thead>
                    <tr>
                        <th>Strateji</th>
                        <th>Peşinat</th>
                        <th>Ev Alım</th>
                        <th>İlk Taksit</th>
                        <th>Vade</th>
                        <th>Maliyet</th>
                    </tr>
                </thead>
                <tbody>
                    ${sonuc.alternatifStratejiler.map((str, index) => `
                        <tr ${index === 0 ? 'style="background-color: #d4edda; font-weight: bold;"' : ''}>
                            <td>${index === 0 ? '✓ Optimal' : (index + 1) + '. Alternatif'}</td>
                            <td>${formatTL(str.pesinat)}</td>
                            <td>${str.evAlimAyi}. ay</td>
                            <td>${formatTL(str.ilkTaksit)}</td>
                            <td>${str.toplamVade} ay</td>
                            <td>${formatTL(str.toplamMaliyet)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            
            <div class="aciklama-kutu" style="margin-top: 15px;">
                <strong>Not:</strong> Yukarıdaki tablo en düşük maliyetli 5 stratejiyi gösterir. Optimal strateji yeşil ile işaretlenmiştir.
            </div>
            ` : ''}
        </div>
    `;
    
    document.getElementById('evimSonuc').innerHTML = html;
}

// Karşılaştırma sonucunu göster
function gosterKarsilastirma(bankaSonuc, evimSonuc) {
    if (!bankaSonuc || !evimSonuc) {
        document.getElementById('karsilastirmaSonuc').innerHTML = 
            '<p>Karşılaştırma yapılamadı.</p>';
        return;
    }
    
    const fark = bankaSonuc.toplamMaliyet - evimSonuc.toplamMaliyet;
    const yuzde = (fark / bankaSonuc.toplamMaliyet * 100).toFixed(1);
    
    let sonucMetni, sinif;
    if (fark > 0) {
        sonucMetni = `EVİM SİSTEMİ ${formatTL(Math.abs(fark))} (%${yuzde}) DAHA AVANTAJLI`;
        sinif = 'avantajli';
    } else {
        sonucMetni = `BANKA KREDİSİ ${formatTL(Math.abs(fark))} (%${Math.abs(yuzde)}) DAHA AVANTAJLI`;
        sinif = 'dezavantajli';
    }
    
    // Grafik için maksimum değeri bul
    const maxDeger = Math.max(bankaSonuc.toplamMaliyet, evimSonuc.toplamMaliyet);
    const bankaYuzde = (bankaSonuc.toplamMaliyet / maxDeger * 100).toFixed(0);
    const evimYuzde = (evimSonuc.toplamMaliyet / maxDeger * 100).toFixed(0);
    
    const html = `
        <div class="fark ${sinif}">
            ${sonucMetni}
        </div>
        
        <div class="grafik-container">
            <h4 style="margin-bottom: 15px;">Maliyet Karşılaştırması</h4>
            <div class="grafik-bar">
                <div class="grafik-label">Banka Kredisi</div>
                <div class="grafik-bar-wrapper">
                    <div class="grafik-bar-fill banka" style="width: ${bankaYuzde}%">
                        ${formatTL(bankaSonuc.toplamMaliyet)}
                    </div>
                </div>
            </div>
            <div class="grafik-bar">
                <div class="grafik-label">Evim Sistemi</div>
                <div class="grafik-bar-wrapper">
                    <div class="grafik-bar-fill evim" style="width: ${evimYuzde}%">
                        ${formatTL(evimSonuc.toplamMaliyet)}
                    </div>
                </div>
            </div>
        </div>
        
        <table style="margin-top: 20px;">
            <tr>
                <th>Kriter</th>
                <th>Banka Kredisi</th>
                <th>Evim Sistemi</th>
            </tr>
            <tr>
                <td>Toplam Maliyet</td>
                <td>${formatTL(bankaSonuc.toplamMaliyet)}</td>
                <td>${formatTL(evimSonuc.toplamMaliyet)}</td>
            </tr>
            <tr>
                <td>Peşinat</td>
                <td>${formatTL(bankaSonuc.pesinat)}</td>
                <td>${formatTL(evimSonuc.pesinat)}</td>
            </tr>
            <tr>
                <td>İlk Taksit</td>
                <td>${formatTL(bankaSonuc.aylikTaksit)}</td>
                <td>${formatTL(evimSonuc.ilkTaksit)}</td>
            </tr>
            <tr>
                <td>Vade</td>
                <td>${bankaSonuc.vade} ay</td>
                <td>${evimSonuc.toplamVade} ay</td>
            </tr>
            <tr>
                <td>Toplam Faiz/Ek Maliyet</td>
                <td>${formatTL(bankaSonuc.toplamFaiz)}</td>
                <td>${formatTL(evimSonuc.toplamMaliyet - temizleSayi(document.getElementById('evBedeli').value))}</td>
            </tr>
        </table>
        
        <button class="toggle-detay" onclick="toggleDetay('karsilastirmaDetay')" style="margin-top: 20px;">Detaylı Analiz</button>
        
        <div id="karsilastirmaDetay" class="detay-alan">
            <h4 class="detay-baslik">Maliyet Kırılımı</h4>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div class="aciklama-kutu">
                    <strong>Banka Kredisi Maliyetleri:</strong><br>
                    Ana Borç: ${formatTL(bankaSonuc.krediTutari)}<br>
                    Toplam Faiz: ${formatTL(bankaSonuc.toplamFaiz)}<br>
                    Peşinat: ${formatTL(bankaSonuc.pesinat)}<br>
                    <hr style="margin: 10px 0;">
                    <strong>Toplam:</strong> ${formatTL(bankaSonuc.toplamMaliyet)}
                </div>
                
                <div class="aciklama-kutu">
                    <strong>Evim Sistemi Maliyetleri:</strong><br>
                    Başlangıç Ev Bedeli: ${formatTL(temizleSayi(document.getElementById('evBedeli').value))}<br>
                    Ev Fiyat Artışı: ${formatTL(evimSonuc.evFiyatiAlim - temizleSayi(document.getElementById('evBedeli').value))}<br>
                    Organizasyon Bedeli: ${formatTL(evimSonuc.orgTutari)}<br>
                    ${(evimSonuc.pesinatRepoKaybi > 0 || evimSonuc.taksitRepoKaybi > 0) ? 
                      `Repo Kaybı: ${formatTL(evimSonuc.pesinatRepoKaybi + evimSonuc.taksitRepoKaybi)}<br>` : ''}
                    Kayıp Kira: ${formatTL(evimSonuc.kayipKiraGeliri)}<br>
                    ${evimSonuc.kiraGideri > 0 ? `Kira Gideri: ${formatTL(evimSonuc.kiraGideri)}<br>` : ''}
                    <hr style="margin: 10px 0;">
                    <strong>Toplam:</strong> ${formatTL(evimSonuc.toplamMaliyet)}
                </div>
            </div>
            
            <h4 class="detay-baslik">Önemli Farklılıklar</h4>
            <div class="aciklama-kutu">
                <strong>Ev Sahipliği:</strong> Banka kredisinde hemen, Evim'de ${evimSonuc.evAlimAyi}. ayda<br>
                <strong>Ev Fiyat Artışı:</strong> Evim'de ${formatTL(evimSonuc.evFiyatiAlim - temizleSayi(document.getElementById('evBedeli').value))} fazla ödeme<br>
                <strong>Faiz/Ek Maliyet Oranı:</strong> 
                Banka %${((bankaSonuc.toplamFaiz / bankaSonuc.krediTutari) * 100).toFixed(1)}, 
                Evim %${(((evimSonuc.toplamMaliyet - temizleSayi(document.getElementById('evBedeli').value)) / temizleSayi(document.getElementById('evBedeli').value)) * 100).toFixed(1)}
            </div>
        </div>
    `;
    
    document.getElementById('karsilastirmaSonuc').innerHTML = html;
}

// Toggle fonksiyonu
function toggleDetay(id) {
    const detayAlan = document.getElementById(id);
    const buton = event.target;
    
    detayAlan.classList.toggle('aktif');
    
    if (detayAlan.classList.contains('aktif')) {
        buton.textContent = 'Detayları Gizle';
    } else {
        buton.textContent = 'Detayları Göster';
    }
}

// Sayı formatını düzenle (binlik ayraçlar ekle)
function formatSayi(input) {
    let value = input.value.replace(/\./g, '');
    if (!isNaN(value) && value !== '') {
        input.value = parseInt(value).toLocaleString('tr-TR');
    }
}

// Sayı formatını temizle (hesaplama için)
function temizleSayi(value) {
    // Number input için doğrudan sayı değeri al
    if (typeof value === 'string') {
        return parseInt(value.replace(/\./g, '')) || 0;
    }
    return parseInt(value) || 0;
}

// Yıllık faizi aylığa çevir
function yillikToAylik(yillik) {
    return (Math.pow(1 + yillik / 100, 1/12) - 1) * 100;
}

// Form elemanlarına event listener ekle
document.getElementById('evBedeli').addEventListener('input', function() {
    formatSayi(this);
});

document.getElementById('maxPesinat').addEventListener('input', function() {
    formatSayi(this);
});

document.getElementById('maxAylikOdeme').addEventListener('input', function() {
    formatSayi(this);
});

document.getElementById('kiraAmortismanSuresi').addEventListener('input', function() {
    formatSayi(this);
});

// Yıllık enflasyon değiştiğinde aylığı güncelle
document.getElementById('yillikEvEnflasyonu').addEventListener('input', function() {
    const yillik = parseFloat(this.value) || 0;
    const aylik = yillikToAylik(yillik);
    document.getElementById('aylikEvEnflasyonu').value = aylik.toFixed(1);
});

// Repo checkbox değişimi
document.getElementById('repoKaybiDahil').addEventListener('change', function() {
    const repoFields = document.getElementById('repoFields');
    if (this.checked) {
        repoFields.classList.remove('hidden');
    } else {
        repoFields.classList.add('hidden');
    }
});

// Sayfa yüklendiğinde yıllık enflasyonu hesapla
window.addEventListener('DOMContentLoaded', function() {
    const yillik = parseFloat(document.getElementById('yillikEvEnflasyonu').value) || 0;
    const aylik = yillikToAylik(yillik);
    document.getElementById('aylikEvEnflasyonu').value = aylik.toFixed(1);
    
    // İlk yüklemede formatla
    formatSayi(document.getElementById('evBedeli'));
    formatSayi(document.getElementById('maxPesinat'));
    formatSayi(document.getElementById('maxAylikOdeme'));
    formatSayi(document.getElementById('kiraAmortismanSuresi'));
    
    // Repo alanlarının başlangıç durumunu ayarla
    const repoCheckbox = document.getElementById('repoKaybiDahil');
    const repoFields = document.getElementById('repoFields');
    if (!repoCheckbox.checked) {
        repoFields.classList.add('hidden');
    }
});

// Form submit event listener
document.getElementById('karsilastirmaForm').addEventListener('submit', hesapla);