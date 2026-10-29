# Doğrulama — 20 Ekim 2026

## Sonuç

Windows x64 uygulaması Electron ile paketlendi. v1.0.1 için son `npm test`: **9 test geçti**, başarısız veya atlanan test yok. Bu test takımı geçici PostgreSQL 18.6 kullanır. Mevcut Docker sunucusuna yapılan ayrı kontroller aşağıda açıklanmıştır.

- 100.000 satır CSV aktarımı: satır sayısı, son satır, Türkçe karakterler ve bigint hassasiyeti doğrulandı.
- 25.000 satır Excel aktarımı: dosya ExcelJS ile yeniden okunarak satır sayısı, başlıklar, NULL, büyük sayılar ve metin değerleri doğrulandı.
- Boş sonuçlarda sütun başlıkları, yinelenen sütun adları, 1.000 satır önizleme, sorgu ve aktarım iptali, hata sonrası yeniden çalışma doğrulandı.
- Salt okunur aktarımda veri değiştirme komutları reddedildi. Hatalı ve iptal edilen aktarımlar tamamlanmamış dosya bırakmadı; var olan dosya korunuyor.
- Excel hücre uzunluk sınırı aşılırsa açıklayıcı hata veriliyor; CSV aynı uzun metni eksiksiz yazıyor.
- Sorgu ve bağlantı kayıtları yeniden yükleme sonrasında korunuyor.

## Arayüz kontrolü

Playwright Electron, gerçek Windows penceresinde bağlantı testi, sorguyu kaydetme ve yeniden açma, uygulamayı yeniden başlatma, 1.000 satır önizleme ve **25.000 satırlık CSV/Excel** indirmelerini çalıştırdı. Düğmeler ve IPC gerçek, PostgreSQL bağlantısı gerçek. Otomasyon yalnızca Windows dosya seçme penceresi yerine test hedef yolunu sağladı.

Windows `safeStorage` ile parola şifreleme/çözme çalıştı; parola düz metin kayıt dosyasında bulunmadı. Arayüzde JavaScript çalışma hatası görülmedi. Ekran görüntüsü `test-output/sade-sql.png`.

Aynı arayüz akışı paketlenmiş `dist/win-unpacked/Sade SQL.exe` üzerinde de geçti; kayıtlı sorguya çift tıklayarak çalıştırma doğrulandı.

Tek dosyalık `dist/Sade-SQL-1.0.0-Windows.exe` normal başlatma yoluyla çalıştırıldı; açılan gerçek SQL çalışma alanı yerel CDP üzerinden doğrulandı. Portable NSIS başlatıcısı Playwright'ın Electron ana işlem bağlantısını doğrudan aktarmadığı için bu açılış kontrolü ayrı yapıldı.

## Bağımlılık taraması

- `npm audit --omit=dev`: **0 bulgu**.
- Tüm geliştirme/paketleme zinciri: **8 orta seviye bulgu**, yüksek/kritik bulgu yok. Bunlar `electron-builder → @electron/get → global-agent → roarr → sprintf-js` geliştirme zincirindeki geçişli bildirimler. Çalışma zamanı bağımlılıklarıyla aynı kapsam değildir. Tam rapor `test-output/dependency-audit.json` içinde.
- ExcelJS'in geçişli `uuid` bağımlılığı desteklenen CommonJS 11.1.1+ serisine sabitlendi; dosya yazma ve yeniden okuma testleri bu bağımlılıkla geçti.

## Açık sınırlar

Microsoft Excel uygulamasında dosya açma, kullanıcının gerçek PostgreSQL sunucusu/SSL altyapısı, milyon satırlık Excel sayfa bölme ve her büyüklükte veride bellek tüketimi bu testlerle onaylanmış değildir. EXE dijital imzasızdır. Özel CA dosyası seçimi, SSH tüneli, SQL otomatik tamamlama ve birden çok SQL komutunu birlikte çalıştırma bu sürümde yoktur.

## Mevcut Docker PostgreSQL bağlantısı — ek doğrulama

20 Ekim 2026 tarihinde WSL/Ubuntu içindeki çalışan `whatsapp-postgres-1` container'ının `gateway` veritabanına Windows'tan bağlanıldı. Sunucu PostgreSQL 17.11 olarak döndü.

- Uygulamanın `Database.test()` bağlantı sorgusu geçti; bağlantı ve sorgu toplam süresi bu denemede 53 ms.
- Uygulamanın `Database.preview()` yoluyla `SELECT 1`, mevcut veritabanı ve SSL durumu doğrulandı. Bu yerel bağlantıda SSL kapalıydı; SSL kabul testi değildir.
- Container'ın 5432 portu Windows'a yayınlanmadığından, yalnızca test boyunca WSL içinde `127.0.0.1` üzerinde geçici TCP yönlendirme kullanıldı. Test sonunda yönlendirme kapatıldı.
- Kimlik bilgileri Docker ayarlarından işlem belleğinde okundu; rapora, komut satırına veya uygulamanın kayıtlarına parola yazılmadı. Mevcut container ayarları ve veritabanı verileri değiştirilmedi.
- Bu kontrol uygulamanın gerçek veritabanı modülünü kullandı; açık masaüstü penceresinde düğmeye basma testi değildir. Kalıcı Windows bağlantısı için ayrıca erişilebilir port/yönlendirme gerekir.

Tekrar çalıştırma: `node scripts/test-docker-connection.cjs`. Parolasız sonuç raporu: `test-output/docker-connection.json`.

### Docker üzerinden test verisi aktarımı

Aynı container/veritabanında `generate_series` ile **100.000 satır ve 7 sütun** yapay müşteri verisi üretildi; mevcut tablolar okunmadı veya değiştirilmedi. Uygulamanın gerçek `Database.export()` koduyla iki dosya yazıldı:

| Biçim | Veri satırı | Dosya boyutu | Aktarım süresi |
| --- | ---: | ---: | ---: |
| CSV | 100.000 | 10.575.072 bayt | 9,487 saniye |
| Excel | 100.000 | 4.075.258 bayt | 11,670 saniye |

İki dosya da baştan sona yeniden okunarak satır sayıları, ilk/son kayıtlar, Türkçe karakterler, tutarlar ve tırnak/virgül içeren açıklamalar doğrulandı. Süreler bu yerel Windows–WSL–Docker denemesine aittir; doğrulama okumasını içermez. Bu testte masaüstü düğmeleri yerine uygulamanın aynı dışa aktarma modülü çağrıldı. Geçici yönlendirme test sonunda kapatıldı.

Dosyalar `outputs/docker-test-acf6c900/` altında. Tekrar çalıştırmak için: `node scripts/test-docker-connection.cjs --export` (her seferinde yeni çıktı klasörü açar).

### 1.000.000 satır sorgu ve aktarım ölçümü

20 Ekim 2026 tarihinde aynı Docker PostgreSQL 17.11 üzerinde 7 sütunlu **1.000.000 satır yapay veri** ile test yapıldı. Mevcut uygulamanın export modülü kullanıldı; masaüstü pencere işlemleri bu ölçüme dahil edilmedi. Tablo yaratılmadı veya mevcut tablolar değiştirilmedi.

| Ölçüm | Süre | Kapsam |
| --- | ---: | --- |
| PostgreSQL sorgu yürütme | 1,006 sn | `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`; sunucu yürütmesi, ağ aktarımı ve dosya yazımı hariç |
| Planlama | 0,116 ms | PostgreSQL planlama süresi |
| İlk satırın Windows'a gelmesi | 0,764 sn | Ayrı tam okuma denemesi; bağlantı açılması dahil |
| İlk 1.000 satır önizleme | 0,889 sn | Uygulamanın önizleme yolu; bağlantı açılması dahil |
| 1 milyon satırın Windows'a tam okunması | 77,553 sn | Dosya yazmadan; sorgu, ağ, pg satır çözümleme ve sıralı ID kontrolü dahil |
| CSV dışa aktarma | 72,528 sn | Sorgunun yeniden yürütülmesi, ağ aktarımı ve dosyanın tamamen yazılıp kapatılması dahil |
| Excel dışa aktarma | 92,466 sn | Sorgunun yeniden yürütülmesi, ağ aktarımı, XLSX oluşturma/sıkıştırma ve dosyanın kapatılması dahil |

CSV: **108.750.074 bayt** (108,75 MB); Excel: **40.035.459 bayt** (40,04 MB). Her dosya baştan sona tekrar okunarak tam **1.000.000 veri satırı**, her satırın sıralı kimliği ve ilk/son satır içerikleri doğrulandı. Dosya başlığı satır sayısına dahil değil. CSV doğrulaması 9,400 sn, Excel doğrulaması 16,885 sn sürdü; bunlar aktarım sürelerine eklenmedi.

100 ms aralıkla örneklenen Node test işlemi RSS tepe değeri CSV aktarımında 95 MiB, Excel aktarımında 147 MiB oldu. Başlangıç değerleri sırasıyla 86 ve 143 MiB idi. Bunlar tüm Electron uygulamasının, Docker'ın veya sistemin toplam bellek tüketimi değildir; aşamalar aynı Node işleminde sıralı çalıştığı için önceki aşamaların belleği başlangıç değerlerini etkiler.

Ölçümler Windows–WSL localhost yönlendirmesi–Docker hattında, aşama başına tek çalıştırmaya aittir; istatistiksel ortalama veya gerçek uygulama tablolarındaki JOIN/filtre yükünü temsil etmez. 1 milyon veri satırı Excel'in tek sayfa sınırını geçmediği için bu koşu çok sayfalı aktarımı doğrulamaz. Geçici yönlendirme kapatıldı.

Çıktılar: `outputs/docker-test-1000000-e3f5cf41/`. Aynı klasörde SQL, JSON sorgu planı ve kesin süre/boyutları içeren `verification.json` bulunur. Tekrar çalıştırma: `node scripts/test-docker-connection.cjs --export --rows=1000000`.

### v1.0.1 — paket boyutu karşılaştırması ve seçim

200, 2.000 ve 10.000 satırlık paketler **aynı 1 milyon satır × 7 sütun SQL** ile sırayla, her aday için ayrı Node işlemi başlatılarak mevcut Docker PostgreSQL 17.11 üzerinde ölçüldü. Eski ayar da aynı koşuda tekrar ölçüldü. Her adayın CSV ve Excel dosyası baştan sona okunarak 1 milyon sıralı kimlik ve örnek içerikler doğrulandı (toplam 6 dosya). Geçici yönlendirmeler her koşudan sonra kapatıldı.

| Paket boyutu | Tam okuma | CSV aktarımı | Excel aktarımı | CSV örneklenen RSS zirvesi | Excel örneklenen RSS zirvesi |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 200 (eski) | 74,154 sn | 74,179 sn | 94,707 sn | 95 MiB | 146 MiB |
| 2.000 | 24,639 sn | 23,629 sn | 33,598 sn | 102 MiB | 309 MiB |
| 10.000 | 5,766 sn | 9,431 sn | 31,617 sn | 178 MiB | 349 MiB |

**Seçim:** CSV için **10.000**, Excel için **2.000** satır. CSV eski ayara göre yaklaşık 7,9 kat; seçilen Excel ayarı yaklaşık 2,8 kat hızlı. Excel'de 10.000 paket yalnızca yaklaşık 2 saniye daha hızlı olduğundan daha küçük okuma paketi tercih edildi. Daha geniş hücreler/sütunlar paket başına bellek ihtiyacını artırabilir; bu sonuçlar her sorguda aynı bellek sınırını garanti etmez.

Önizleme okuma paketi 200 ve ekran sınırı 1.000 olarak bırakıldı. Aday koşularında önizleme süreleri 0,833 / 0,872 / 0,869 sn; PostgreSQL yürütme süreleri 0,993 / 0,876 / 0,825 sn oldu.

Süreler aşama başına tek ölçümdür; ısınmış önbellek ve sistem yükü sonuçları etkileyebilir. Aktarım süreleri sorgunun yeniden çalıştırılması, ağ, biçimlendirme ve dosyanın kapatılmasını içerir; yeniden okuma doğrulamasını içermez. Bellek değerleri 100 ms aralıkla alınan **Node test işlemi RSS** örnekleridir; tüm Electron/Docker/sistem belleği değildir. Aynı adayın aşamaları tek işlemde çalıştığı için önceki aşamalardan kalan bellek de dahildir: Excel başlangıç RSS değerleri 200/2.000/10.000 paketler için 142/142/178 MiB idi. Zirve farklarının tamamı paket boyutuna atfedilemez.

Yeni test, 2.000 ve 10.000 paketlerle CSV ve Excel aktarımını 1.000 satırdan sonra iptal ederek mevcut hedef dosyanın korunduğunu, `.partial` dosya kalmadığını ve sonraki sorgunun çalıştığını doğruladı. Son test takımı: 9/9 geçti.

Ham karşılaştırma raporu: `test-output/batch-benchmark.json`. Tekrar çalıştırma: `node scripts/benchmark-batches.cjs`. Çıktılar `outputs/docker-test-1000000-batch-*/` altında. Paket seçimini geçici olarak karşılaştırmak için `node scripts/test-docker-connection.cjs --export --rows=1000000 --batch-size=2000` kullanılabilir; uygulamanın varsayılanları kaynakta tanımlıdır.

Kaynak değişiklikleri: `src/database.js` biçime göre paket boyutu ve karşılaştırma için kontrollü seçenek; `test/database.test.js` büyük paket iptal testleri; benchmark betikleri; v1.0.1 sürüm ve başlatıcı güncellemesi. Bağımlılıklar değiştirilmedi. Yeni Windows EXE: `dist/Sade-SQL-1.0.1-Windows.exe`.

v1.0.1 paketlenmiş `dist/win-unpacked/Sade SQL.exe` üzerinde Playwright ile sürüm kontrolü, bağlantı testi, Windows parola şifrelemesi, sorgu kaydetme/yeniden başlatma/çift tıklayarak çalıştırma ve varsayılan paketlerle 25.000 satır CSV + Excel indirme geçti. Arayüzde JavaScript çalışma hatası görülmedi.

Tek dosyalık `dist/Sade-SQL-1.0.1-Windows.exe` normal Windows başlatma yoluyla açıldı; gerçek SQL çalışma alanı yerel CDP üzerinden doğrulandı. Başlatıcı kök klasördeki `Sade SQL Baslat.cmd` üzerinden yeni sürümü açar.

### v1.0.2 — bağlantı hatası açıklaması ve yerel Docker erişimi

Kullanıcının “Bağlantıyı test et” işleminde gördüğü genel hata araştırıldı. Mevcut `whatsapp-postgres-1` çalışıyordu, ancak `5432/tcp` portu Windows'a yayınlanmıyordu. Node'un mesajı boş olabilen `AggregateError` bağlantı reddini genel “İşlem tamamlanamadı” mesajına düşürüyordu.

`src/errors.js`, bağlantı reddi, DNS, bağlantı zaman aşımı, kullanıcı/parola, veritabanı adı ve dosya izni hatalarını açıklayıcı Türkçe mesajlara çevirir. SQL statement timeout gibi sorgu hatalarının asıl mesajı korunur. Gerçek kapalı localhost portuyla ve boş mesajlı AggregateError ile hata mesajı doğrulandı. Test takımı 10/10 geçti; son timeout ayrımını kapsayan hata testi ayrıca geçti.

`scripts/docker-local.cjs` mevcut container'ı yeniden oluşturmadan Windows `127.0.0.1:15432` → WSL/Python → Docker PostgreSQL yönlendirmesi açar. Yalnızca localhost üzerinde dinler; parola diske veya loga yazılmaz. `.local/docker-local.json` parola içermez, PID ve yerel durdurma kontrolü için rastgele anahtar içerir. `Docker PostgreSQL Ac.cmd` ve `Docker PostgreSQL Kapat.cmd` ile yönetilir. İkinci kez açma isteğinde mevcut yardımcı korunur; ikinci bir yönlendirme başlatılmadığı doğrulandı.

Windows erişimi açıldıktan sonra paketlenmiş 1.0.2 penceresinde **gerçek Docker veritabanıyla** `scripts/smoke.cjs --docker` çalıştırıldı: hatalı portta açıklayıcı bağlantı reddi mesajı, doğru `127.0.0.1:15432`/`gateway` ayarlarıyla başarılı bağlantı, kaydetme/yeniden başlatma, sorgu ve 25.000 satır CSV/Excel düğmeleri geçti. Kontrol, kullanıcının normal kayıtlarını değiştirmeyen ayrı geçici uygulama diziniyle yapıldı; mevcut veritabanı tabloları değiştirilmedi.

Bu kez yerel yönlendirme kullanıcının uygulamadan bağlanabilmesi için açık bırakıldı. Windows/WSL oturumları yeniden başladığında yardımcıyı tekrar açmak gerekir. Veritabanı container'ı yeniden başlar ve ağ adresi değişirse yardımcı kapatılıp yeniden açılmalıdır. Otomatik sistem başlangıcı veya Windows servisi kurulmadı. EXE genel istemcidir; Docker yönlendirme yardımcısı bu geliştirme bilgisayarına özeldir ve Node.js/WSL/Python gerektirir.

Son 1.0.2 paketinde `src/errors.js` ve `src/main.js` içerikleri ASAR içinden okunup kaynakla birebir karşılaştırıldı. Bu pakette Docker üzerinden arayüz testi tekrar geçti. `dist/Sade-SQL-1.0.2-Windows.exe` normal başlatma yoluyla açılarak SQL çalışma alanı doğrulandı.

### v1.0.3 — tablolar ve doğrudan Ctrl+S güncellemesi

Sol panelde şemalara göre tablo/görünüm listesi, ad araması ve yenileme eklendi. Metadata sorgusu `pg_catalog` üzerinden yalnızca sistem dışı, şema USAGE ve tablo SELECT yetkisi olan nesneleri getirir; partition alt tabloları listelenmez. Metadata bağlantısı sorgu/export bağlantısından ayrıdır. Bağlantı değiştiğinde geç tamamlanan eski isteğin sonucu gösterilmez. Tabloya tıklamak SQL tanımlayıcılarını çift tırnakla güvenli biçimde yazar; kendiliğinden tablo verisi sorgulamaz.

Kayıtlı sorguda Ctrl+S ve Kaydet aynı ID/adla SQL'i günceller. İlk kayıtta isim istenir. ⋯ düğmesi ad değiştirme ve kopyalama penceresini korur. Kaydetme sırasında tekrar eden kaydetme istekleri engellenir; kaydetme başında alınan SQL görüntüsü kullanılır, sonradan yazılan değişiklikler yanlışlıkla kaydedilmiş sayılmaz.

Yerel PostgreSQL testleri **11/11 geçti**: ek catalog testi izin verilmeyen tablo ve sistem nesnelerinin görünmediğini; boşluk/çift tırnak içeren tablo adlarının bozulmadığını; tablo/görünüm türlerinin doğru olduğunu doğruladı. İzin testi için yalnızca geçici test cluster'ında şema/tablo/rol oluşturulup silindi.

Gerçek Docker `gateway` bağlantısıyla Windows penceresinde 51 tablo/görünüm listelendi; tablo araması ve tablo seçilince doğru SELECT metninin editöre açılması doğrulandı. Mevcut tablolara SELECT çalıştırılmadı. Ctrl+S ile SQL'e eklenen değişiklik, kayıt ID'si ve sorgu sayısı sabit kalırken dosyada güncellendi; isim penceresi açılmadı; uygulama yeniden açılınca değişiklik korundu. Önizleme ve 25.000 satır CSV/Excel düğmeleri de geçti. Kontrol ayrı geçici kullanıcı veri dizini kullandı; kullanıcının kayıtları değiştirilmedi.

1000×660 minimum pencere boyutunda bağlantı satırı, kaydırılabilir tablo listesi, kayıtlı sorgular ve alt bilgi yerleşimi kontrol edildi; bağlantı satırının sıkışması düzeltildi. Minimum boyutta alt bilginin pencere içinde kalması ve sorgu listesinin yüksekliği otomasyonda da doğrulandı.

Son paketlenmiş uygulamada Docker arayüz testi ve minimum pencere kontrolü tekrar geçti. Değişen altı uygulama dosyası ASAR içinden okunarak kaynakla birebir karşılaştırıldı. Kullanıcının açık 1.0.3 EXE'si dosyayı kilitlediği için açık pencereye dokunulmadan yalnızca bekleyen paketleyici durduruldu; doğrulanmış uygulama `--prepackaged dist/win-unpacked --config.directories.output=dist/release-1.0.3` ile ayrı klasöre paketlendi. Son teslim dosyası `dist/release-1.0.3/Sade-SQL-1.0.3-Windows.exe`; bu tek dosyalık paketin normal Windows açılışı da ayrı geçici kullanıcı veri diziniyle doğrulandı. Başlatıcı bu teslim yolunu kullanır.

### v1.0.4 — parametre girişleri ve SQL tamamlama

`:isim` ve `$1` biçimlerini tanıyan ortak tarayıcı (frontend/backend), parametre tür/NULL alanları ve PostgreSQL bind değerleri eklendi. Yorumlar, normal/E kaçışlı metinler, tırnaklı tanımlayıcılar, iç içe blok yorumları ve ASCII/Unicode etiketli dollar-quoted gövdeler parametre kabul edilmez. Tekrarlı isim aynı bind indeksini kullanır. İsimli/konumsal karışım, eksik değer, sırasız $ numarası ve 128 üzeri parametre açıklayıcı hatayla reddedilir. Tür seçimi ve değerler sorgu kayıt dosyasına yazılmaz.

Önizleme ve iki export yazıcısı aynı derlenen SQL + ayrı bind değerlerini kullanır. PostgreSQL DATE parser'ı istemciye özel olarak takvim gününü metin döndürecek şekilde ayarlandı; saat dilimi nedeniyle bir önceki güne kayma engellendi. Numeric/bigint hassasiyeti korunur.

Yerel PostgreSQL entegrasyon ve lexer/tamamlama testleri **15/15 geçti**. Parametreli 1.250 satır önizleme/CSV/Excel, tekrarlı parametre, NULL/boolean, JSON dizi, DATE ve 9007199254740993.123456 hassas değeri doğrulandı. SQL komutuna benzeyen tırnaklı metin aynı değer olarak geri okundu. Unicode dollar etiketi için lexer testleri son değişiklikten sonra ayrıca geçti.

Windows penceresi gerçek Docker bağlantısıyla test edildi: otomatik parametre alanları, tür seçimi, NULL kutusu, gerçek sorgu sonucu, parametreli CSV/Excel düğmeleri, diskten değerlerin okunamaması ve sorgu değişince alanların sıfırlanması geçti. Ctrl+Space/Tab ile SELECT anahtar kelimesi ve mevcut gerçek tablo takma adından sütun tamamlama doğrulandı; yorum içinde tamamlama açılmadı. Mevcut uygulama tabloları çalıştırılmadı; metadata okundu, veri sorguları sentetik/literal sonuç kullandı.

Tamamlama yerel SQL kelimeleri ve mevcut bağlantının tablo/sütun metadata'sına dayanır; tam dil sunucusu/CTE çözümleyicisi değildir. Çalıştırma/indirme parametreleri yalnızca değerler içindir; SQL tanımlayıcısı veya komut parçası olamaz. Eski milyon satır süreleri tarihsel ölçümlerdir; bu sürüm için yeni milyon satır performans koşusu yapılmadı.

Kaynak değişiklikleri: `src/ui/sql-tools.js`, `src/ui/sql-editor.js`, `src/ui/editor.css`, HTML/app entegrasyonu, `src/database.js` ve main IPC; testler ve v1.0.4 sürüm/başlatıcı. Yeni bağımlılık eklenmedi. Teslim dizini: `dist/release-1.0.4/`.

Paketlenmiş **1.0.4** üzerinde aynı Docker arayüz akışı ve parametre/tamamlama/parametreli indirme kontrolleri tekrar geçti. Yedi değişen uygulama dosyası ASAR içeriğiyle birebir karşılaştırıldı. `dist/release-1.0.4/Sade-SQL-1.0.4-Windows.exe` normal Windows açılışıyla başlatılıp çalışma alanı doğrulandı; açık kullanıcı uygulamaları kapatılmadı.

### v1.0.5 — GitHub güncelleme kontrolü ve taşınabilir sürüm geçişi

Paketlenmiş uygulama 5 saniye sonra ve 6 saatte bir `tguduk42/sade_sql` GitHub Releases kararlı sürümünü kontrol eder. Sol panelde elle kontrol/indirme düğmesi bulunur. İndirme kullanıcı isteğiyle başlar; yüzde ilerlemesi gösterilir. Yalnızca doğru sürüm ismi, depo URL'si, boyut ve GitHub SHA-256 bilgisi olan EXE kabul edilir. Akış `.partial` dosyasına yazılır; boyut ve özet doğrulandıktan sonra hedef isim atomik olarak oluşturulur. Mevcut dosya ezilmez. Açmadan hemen önce özet tekrar doğrulanır.

18/18 PostgreSQL ve birim testleri geçti. Yeni testler: sayısal sürüm sırası, eski/eşit/ön sürümü atlama, depo dışı URL ve eksik özeti reddetme; eşzamanlı indirmeyi tekilleştirme; doğrulanmış dosyayı tekrar kullanma; dosyanın sonradan değiştirilmesini algılama; bozuk/kesik/aşırı boyutlu indirme ve HTTP hatasında EXE/partial bırakmama; ağ hatasından sonra tekrar kontrol. Test verisi sentetiktir, çalıştırılabilir kod içermez.

`scripts/smoke-update.cjs` son paketlenmiş uygulamada ayrı profil ve indirme klasörüyle çalıştırıldı. Test, istemci sürümünü 1.0.3 olarak simüle edip gerçek GitHub v1.0.4 EXE'sini ağdan indirdi ve doğruladı. Kaydedilmemiş sorguda kapatma için Vazgeç seçilince pencere açık kaldı ve yeniden başlatma planlanmadı. Devam et seçilince gerçek Electron `app.relaunch` üzerinden indirilen taşınabilir v1.0.4 açıldı; sürüm etiketi ve önceden kaydedilmiş sorgu yeni pencerede doğrulandı. Yalnızca native kapatma yanıtı ve test sürümü/indirme dizini test tarafından sağlandı. Kullanıcının kayıtları/pencereleri değiştirilmedi. Testin sonraki sürümlerde de tekrar edilebilmesi için GitHub v1.0.4 fixture yayını sabitlenmiştir; üretim kodu `/releases/latest` kullanır.

Son paketlenmiş uygulama ile gerçek Docker PostgreSQL bağlantısı, metadata listesi, doğrudan Ctrl+S güncellemesi, parametreler ve SQL tamamlama, 25.000 satır CSV/Excel arayüz kontrolleri de tekrar geçti. Minimum pencere boyutu kontrolü geçti. Yeni bağımlılık eklenmedi.

Taşınabilir güncelleme İndirilenler/Sade SQL altında yeni EXE oluşturur ve açar; eski EXE'yi/kısayolları değiştirmez. Sonraki açılışlarda yeni dosya kullanılmalıdır. 1.0.4 ve önceki sürümler güncelleme kodunu içermediğinden ilk 1.0.5 geçişi elle yapılır. Ağ erişimi olmayan makineler, gerçek GitHub istek sınırına ulaşma ve gerçek kullanıcıların farklı indirme klasörü izinleri ayrıca test edilmedi. SHA-256 kontrolü Windows kod imzası değildir; GitHub deposu/yayın yetkisine güvenilir.

### v1.0.6 — CSV'nin Türkçe Excel'de açılması (29 Ekim 2026)

Kullanıcı CSV'yi Excel'de açınca Türkçe karakterlerin ve tutarların bozulduğunu bildirdi. Eski CSV UTF-8 BOM içeriyordu fakat virgül sütun/nokta ondalık ayırıcı kullanıyordu. Excel'in otomatik içe aktarımı makinenin yerel ayarlarından etkilenir; kullanıcının bozuk dosyası verilmediği için özgün dosyadaki her alanın nedeni birebir doğrulanmadı.

CSV düğmesinin yanına üç biçim eklendi. Varsayılan Excel (Türkçe / UTF-8): UTF-8 BOM, noktalı virgül sütun ayırıcı ve sayısal PostgreSQL sütunlarında ondalık virgül. Eski Excel (Windows-1254): aynı ayırıcılar ve açıkça seçilen Türkçe eski kodlama. Standart (UTF-8): mevcut virgül/nokta davranışı korunur. Sadece int2/int4/int8/float4/float8/numeric türleri yerelleştirilir; metin kodları, tarihler, JSON ve NULL davranışı değişmez. Numeric değerleri Number'a çevrilmeden dönüştürülür. Windows-1254'e sığmayan karakterler sessizce soru işaretine dönüşmez: aktarım hata verir, eski hedef korunur, partial temizlenir. XLSX davranışı değişmedi. Yeni bağımlılık eklenmedi.

21/21 test geçti. Yeni kapsam: tüm Türkçe İ/ı/Ş/ş/Ğ/ğ/Ü/ü/Ö/ö/Ç/ç karakterleri; 1234.5600, -0.18, 0.000001; büyük bigint'in ham CSV hassasiyeti; metin 00123.45, tarih ve JSON'un değişmemesi; noktalı virgül/tırnak/yeni satır kaçışı; boş başlık; Windows-1254 geri okuma; desteklenmeyen emoji hatasında hedef ve partial kontrolü. Mevcut 100.000 satır CSV, 25.000 satır XLSX ve iptal kontrolleri de geçti.

Kaynak ve son paketlenmiş uygulamada `scripts/smoke.cjs` gerçek geçici PostgreSQL 18.6 ile çalıştırıldı. Arayüzde üç CSV biçimi seçilip gerçek IPC/veritabanı/yazıcı üzerinden alındı; Türkçe karakterler, pozitif/negatif tutar ve metin kodu dosyadan okundu. Kayıtlı sorgular, parametreler, 25.000 satır CSV/XLSX ve minimum pencere boyutu kontrolleri geçti. Bu koşu Docker veritabanını kullanmadı; ayrı geçici test cluster'ı açılıp kapatıldı. Paket ASAR içindeki 14 kaynak dosyası yerel kaynakla birebir karşılaştırıldı.

`scripts/verify-csv-excel.ps1` paketlenmiş uygulamanın ürettiği üç dosyayı kurulu Microsoft Excel'in gerçek metin içe aktarıcısıyla açtı. Kodlama, ayırıcı ve ondalık yerel ayarı açıkça verildi; Türkçe karakterler ve Excel'in sayısal Value2 değerleri 1234.56, -12.34, 0.18 doğrulandı. Test makinesi en-US olduğu için CSV kopyası .txt ile açık içe aktarıma yönlendirildi; kullanıcının Türkçe Windows'unda doğrudan çift tıklama testi yapılmış sayılmaz. Windows bölge ayarı değiştirilmedi; test Excel örneği dosyaları kaydetmeden kapatıldı. COM nesneleri yalnızca bu testin açtığı Excel örneğine aittir.

CSV sütun türü taşımaz: Excel'in 15 anlamlı rakam sınırını, otomatik tarih/sayı tahminini ya da baştaki sıfırları dosya biçimiyle her okuyucuda engellemek mümkün değildir. Bu tür hassas değerler için XLSX önerilir; Türkçe bölge ayarı olmayan Excel'de içe aktarım ayarları açıkça seçilmelidir. Eski bozuk CSV'ler kendiliğinden düzelmez; sorguyu yeni sürümde tekrar dışa aktarmak gerekir. Kullanıcı dosyası/veritabanı değiştirilmedi.

### Ek doğrudan Excel açılışı — Türkçe Windows bölge biçimi

Windows Denetim Masası → Bölge → Biçim, gerçek arayüzden Turkish (Türkiye) olarak uygulanarak test tekrarlandı. Yeni PowerShell sürecinin etkin kültürü `tr-TR`, ondalık `,`, binlik `.`, liste `;` olarak doğrulandı. Yalnızca registry LocaleName değerini değiştirmek bu bilgisayarda yeterli değildi: başlangıçta "Match Windows display language" seçili olduğu için etkin kültür en-US kalıyordu. Bu ilk deneme Türkçe ortam başarısı olarak sayılmadı.

Ardından v1.0.6 paketlenmiş uygulamadan üretilmiş varsayılan Excel (Türkçe / UTF-8) CSV'si Dosya Gezgini'nden çift tıklanarak açıldı. .txt uzantısı, OpenText, içe aktarma sihirbazı veya elle ayırıcı seçimi kullanılmadı. Beş sütun doğru ayrıldı. A2 formül çubuğunda `Çağrı İıŞşĞğÜüÖöÇç`, B2 `1234,56`, C2 `-12,34`, D2 `0,18` okundu. B2:D2 seçilince Excel'in gerçek durum çubuğu ortalama `407,4666667`, toplam `1222,4` gösterdi; hücreler sayı olarak tanındı. Test dosyası değiştirilmeden kapatıldı. Bu kanıt Windows görüntüleme dilinin tümünü veya eski Excel/Windows-1254 çift tıklamasını kapsamaz; etkin Türkçe bölge biçimi ve kurulu Excel ile UTF-8 CSV açılışını kapsar.

### v1.0.7 — ekranda ve dosyalarda tutar görünümü

Sonuçlarda Sayı görünümü seçimi eklendi: Tutar (36.000,00) varsayılan, Ham değer geri dönüşü mevcut. İstemci ham satırları korur ve PostgreSQL tür metadata'sıyla gösterim yapar; hücre başlığında ham değer bulunur. Ondalıklı numeric/float sütunları ve adı tutar/amount/fiyat/bakiye/toplam gibi olan sayısal sütunlar biçimlenir; kimlik/kod isimli sütunlar ve normal tam sayı ID'ler hariçtir. İki ondalığa yuvarlama string/BigInt ile yapılır: 1.005 → 1,01; büyük değerler Number'a çevrilmez. Veritabanı değiştirilmez.

Türkçe CSV görünümü `36000` → `36.000,00`, `850000.0000000` → `850.000,00` yazar; standart CSV ham değerleri korur. XLSX'te Excel'in 15 anlamlı rakam sınırına sığan tutarlar sayı ve `#,##0.00` stiliyle yazılır. Ayırıcıların ekranda görünümü Excel'in bölge ayarına bağlıdır. Sığmayan hassas değerler tam metin olarak bırakılır; Excel'in yuvarlamasıyla veri kaybı önlenir. İki ondalıklı gösterim, depolanan ham veri hassasiyetini değiştirmez.

24/24 test geçti. Yeni veritabanı testi ham önizleme/type metadata'sını, gruplu Türkçe CSV'yi, standart CSV'nin değişmemesini, XLSX'te 36000/850000 sayısal değerlerini ve iki ondalık stilini, ID/kod istisnalarını ve büyük hassas metinleri doğruladı. Sayı biçimlendirici testleri pozitif/negatif/sıfır, bilimsel gösterim, basamak taşıması ve büyük hassas sayıları kapsar.

`scripts/smoke-number-display.cjs` masaüstünü kontrol etmeden headless Chrome'da renderer'ı doğruladı. Sentetik preload köprüsüyle 36.000,00 / 850.000,00 görünümü, ham tooltip, ID/kodların korunması, Ham değer geçişinde SQL'in yeniden çalışmaması ve export seçeneğinin köprüye iletilmesi kontrol edildi. Bu test gerçek Electron IPC veya gerçek Excel görsel testi olarak sayılmaz; PostgreSQL/CSV/XLSX yazımı ayrı gerçek veritabanı entegrasyon testinde doğrulandı. Kullanıcı Esc ile bilgisayar kontrolünü durdurduğu için v1.0.7'de yeni bir native Excel görsel testi yapılmadı.
