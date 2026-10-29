# Sade SQL

Windows için ücretsiz, açık kaynak PostgreSQL istemcisi. Beekeeper Studio'dan esinlenen sade, Türkçe arayüz; kayıtlı sorgular, sonuç önizlemesi, Excel ve CSV dışa aktarma.

## Aç ve kullan

[**Windows EXE indir — v1.0.8**](https://github.com/tguduk42/sade_sql/releases/download/v1.0.8/Sade-SQL-1.0.8-Windows.exe) · [Tüm sürümler](https://github.com/tguduk42/sade_sql/releases)

İndirilen EXE'ye çift tıklayın; kurulum gerekmez. Kaynak kod ZIP dosyası EXE içermez; hazır uygulamayı yukarıdaki bağlantıdan veya Releases bölümünden indirin.

`dist/release-1.0.8/Sade-SQL-1.0.8-Windows.exe` dosyasını açın veya kök klasördeki `Sade SQL Baslat.cmd` dosyasına çift tıklayın. Kurulum, Node.js veya yerel PostgreSQL sunucusu gerekmez; erişebildiğiniz bir PostgreSQL sunucusu yeterlidir. Alternatif olarak `dist/release-1.0.8/win-unpacked/Sade SQL.exe` açılabilir; bu seçenekte yanındaki dosyalar da korunmalıdır. Standart `npm run dist` çıktısı `dist/` köküne yazılır; mevcut EXE açıksa farklı çıktı diziniyle paketleyin.

### Bu bilgisayardaki WSL/Docker PostgreSQL

`Docker PostgreSQL Ac.cmd` mevcut `Ubuntu` dağıtımındaki `whatsapp-postgres-1` container'ına yalnızca yerel bir yönlendirme açar; container ayarlarını değiştirmez. Bu yardımcı için bilgisayarda Node.js, WSL ve Python 3 gerekir. Açılan yardımcı pencereyi bağlantıyı kullanırken açık tutun. Windows uygulamasına sunucu **127.0.0.1**, port **15432**, veritabanı ve kullanıcı **gateway**, SSL **Kapalı** girin. Parola Docker ayarınızdaki PostgreSQL parolasıdır.

Yönlendirmeyi kapatmak için `Docker PostgreSQL Kapat.cmd` kullanın. Başlatıcı aynı yönlendirme çalışıyorsa ikinci bir tane açmaz. Windows/WSL veya Docker yeniden başlatıldığında gerekirse kapatıp yeniden açın. Bu yardımcı ayrı bir geliştirme bilgisayarı kolaylığıdır; genel PostgreSQL istemcisi EXE'sinin çalışması için gerekli değildir.

1. Sol üstte **Bağlantılar +** ile sunucu, port, veritabanı, kullanıcı ve parolayı girin.
2. **Bağlantıyı test et** ile kontrol edin, **Kaydet ve seç** düğmesine basın.
3. SQL yazın; **Ctrl+S** ilk kayıtta isim ister. Kayıtlı sorguda **Ctrl+S** aynı sorguyu doğrudan günceller; yeniden isim istemez ve kopya oluşturmaz. **Kaydet** düğmesi de aynı şekilde çalışır. **⋯** düğmesi ad değiştirme/yeni kopya seçeneklerini açar.
4. Soldaki sorguyu seçip **Ctrl+Enter** ile çalıştırın. Sorguya çift tıklamak da açıp çalıştırır.
5. **Excel indir** veya **CSV indir** düğmesine basıp dosya konumunu seçin.

**Ctrl+N** yeni sorgu açar. **SQL dosyası aç** mevcut `.sql` dosyalarını içe alır. Kayıtlı sorguların adında arama yapılabilir; üzerine gelince görünen × düğmesi kaydı siler.

Bağlantı kaydedilip seçildiğinde soldaki **Tablolar** bölümü şemalara göre yüklenir. Tablo adında veya `şema.tablo` biçiminde arayın; **↻** ile yenileyin. Bir tablo/görünüme tıklamak editörde doğru tırnaklanmış `SELECT * FROM ...;` sorgusunu açar; çalıştırmak için Çalıştır'a basın. Kaydedilmemiş SQL varsa geçmeden önce sorulur. Yalnızca şemasına erişiminiz ve tablo seviyesinde SELECT yetkiniz olan kullanıcı tabloları/görünümler listelenir; sistem şemaları ve partition alt tabloları gizlenir. Kaydedilmiş parola varsa uygulama açıldığında liste otomatik yüklenir; parola saklanmıyorsa bağlantıyı açın veya ↻ düğmesini kullanın.

## Parametreli sorgular

`:isim` yazınca editör altında otomatik parametre alanları açılır. İşaretçileri tırnak içine almayın:

```sql
SELECT i AS kayit_no, :sehir::text AS sehir
FROM generate_series(1, :adet::int) AS i
WHERE i >= :baslangic::int;
```

Örneğin `sehir=İstanbul`, `adet=1000`, `baslangic=1` girip Çalıştır veya Excel/CSV indir düğmesine basın. Aynı isim tekrar geçerse tek alan kullanılır. PostgreSQL'in `$1`, `$2` biçimi de desteklenir; $ numaraları 1'den başlayıp sıralı olmalı. İki biçim aynı sorguda karıştırılamaz. En fazla 128 farklı parametre vardır; isimli parametrelerde Latin harfleri, rakamlar ve alt çizgi kullanın, ilk karakter rakam olmamalı.

Türler: **Metin, Sayı, Tarih, Tarih/saat, Boolean, JSON**. Sayılarda nokta ayırıcı, Boolean için `true`/`false` kullanın. Sayılar JavaScript kayan noktalı sayıya çevrilmeden gönderilir; büyük sayı hassasiyeti korunur. JSON dizileri için `::jsonb`, sayı/tarih gibi belirsiz ifadelerde uygun PostgreSQL `::tip` dönüşümü kullanın. Metin alanı boşsa boş metin gönderilir; SQL NULL için **NULL** kutusunu seçin. NULL ile karşılaştırma PostgreSQL'in normal `IS NULL`/`IS NOT DISTINCT FROM` kurallarına tabidir.

Değerler SQL'e birleştirilmez; ayrı PostgreSQL bind değerleri olarak gönderilir. Sorgu adı ve parametreli SQL kaydedilir, **girilen değerler ve tür seçimleri diske kaydedilmez**. Sorgu değiştirince alanlar sıfırlanır. Çalıştır ve Excel/CSV aynı mevcut alan değerlerini kullanır; indirme yine sorguyu yeniden çalıştırır. Parametreler tablo/sütun adı veya SQL parçası yerine kullanılamaz, yalnızca veri değerleri içindir.

## Otomatik tamamlama

Yazarken öneriler açılır; **Ctrl+Space** ile elle de açabilirsiniz. **↑/↓** ile seçin, **Tab** veya **Enter** ile ekleyin, **Esc** ile kapatın. Öneriler SQL anahtar kelimeleri, mevcut bağlantının şemaları/tabloları ve sütunlarını içerir. `FROM`/`JOIN` ile kullanılan basit tablo takma adları için `t.` sonrasında sütunlar önerilir. `public.` yazınca o şemanın tabloları listelenir. Tırnaklı metin ve yorumların içinde öneri açılmaz.

Metadata bağlantı sırasında ve ↻ ile yüklenir; öneri üretmek için harici servis/AI çağrısı yapılmaz. Tam bir PostgreSQL dil sunucusu değildir: karmaşık CTE/alt sorgu sonuç sütunlarını, dinamik SQL'i veya tüm alias kapsamlarını anlamsal olarak çözümlemez. Sütun/veri türü açıklamaları PostgreSQL metadata'sından gelir. Girilen tablo/sütun isimleri SQL tanımlayıcısı olarak güvenli biçimde tırnaklanır.

## Dışa aktarma davranışı

### Tutar görünümü

Sonuçların üstündeki **Sayı görünümü → Tutar (36.000,00)** varsayılandır. `36000` → `36.000,00`, `850000.0000000` → `850.000,00` görünür. `numeric`/ondalıklı sütunlara ve adı tutar/amount/fiyat/bakiye/toplam gibi olan sayısal sütunlara uygulanır; ID, kimlik, kod, UUID ve IBAN isimli sütunlar hariçtir. Tam sayı ID ve metin kodları değiştirilmez. İki basamağa yuvarlama yapılır; yarımlar sıfırdan uzağa yuvarlanır. Veritabanı ve sorgu metni değiştirilmez. Ekranda hücrenin üzerine gelince ham değer görünür; **Ham değer** seçeneği sorguyu yeniden çalıştırmadan eski görünümü açar.

Türkçe CSV seçenekleri aynı görünümü dosyaya yazar. **Standart CSV**, makineye aktarım için ham noktalı değerleri korur. Excel'de 15 anlamlı rakama sığan tutarlar sayı olarak yazılır ve `#,##0.00` biçimi uygulanır; Türkçe Excel bölge ayarında `36.000,00` görünür, toplam alınabilir. Excel'in kendi bölge ayarı farklıysa ayırıcıların görünümü o ayara uyar. Excel'e sığmayacak hassas değerler, yuvarlanıp bozulmaması için eski davranıştaki gibi tam metin olarak korunur. Bu istisnada XLSX hücresi tutar görünümüne çevrilmez; ham değeri saklar.

### Tarih-saat görünümü

`timestamp` ve `timestamptz` sütunları sonuç ekranında, Türkçe CSV seçeneklerinde ve XLSX'te **`YYYY-MM-DD HH:mm:ss.ffffff`** biçimindedir; örnek: `2022-12-21 12:26:06.671862`. Kesir yoksa `.000000`, `.1` ise `.100000` yazılır. JavaScript Date dönüşümü yapılmaz; PostgreSQL'in altı basamaklı mikrosaniye bilgisi korunur. Yalnızca tarih içeren `date` sütunları `YYYY-MM-DD` olarak kalır; olmayan bir saat eklenmez. Metin/JSON içindeki tarihler değiştirilmez.

Saat dilimli alanlarda PostgreSQL oturumunun saat dilimindeki saat kullanılır; bilgisayarın saat dilimine veya zorla UTC'ye çevrilmez. İstenen görünümde saat dilimi son eki yazılmaz; ekranda ham tooltip ve Standart CSV bu bilgiyi korur. Standart CSV, PostgreSQL'in ham ISO metnini ve mevcut kesir basamaklarını saklar. CSV'yi Excel'de doğrudan açmak, Excel'in otomatik tarih yorumlamasına tabidir; altı basamağın kesin korunması için XLSX kullanın. XLSX tarih-saat hücreleri mikrosaniye kaybını önlemek için **metin** olarak yazılır; Excel seri tarih değeri değildir.

Uygulama bağlantısında yalnızca tarih çıktı stili ISO yapılır. Sunucunun DMY/MDY/YMD tarih giriş sırası ve oturum TimeZone ayarı korunur. `infinity`, `-infinity` ve BC gibi olağan dışı değerler dönüştürülmeden bırakılır. Bu gösterim skaler tarih-saat sütunları içindir; tarih dizileri/JSON için yeni dönüştürme uygulanmaz.

### Aktarım kuralları

- Ekranda ilk **1.000 satır** gösterilir. Dosya aktarımı bu sınırı kullanmaz; veritabanından bütün satırları akışla okur. Ticari satır limiti veya abonelik yoktur.
- v1.0.1'de CSV aktarımı 10.000, Excel aktarımı 2.000 satırlık paketler kullanır. Önizlemenin okuma paketi 200 olarak kalır. Windows–WSL–Docker üzerinde 1 milyon satırla karşılaştırma sonuçları `DOGRULAMA.md` içinde.
- Aktarım **editördeki sorguyu yeniden çalıştırır**. Önizlemeden sonra veritabanındaki veriler değişmişse dosya yeni sonucu içerir. Aynı sıralama için sorguya `ORDER BY` ekleyin.
- Aktarımlar PostgreSQL **READ ONLY** işlemi içinde çalışır. `INSERT`, `UPDATE`, `DELETE` gibi veri değiştiren komutlar indirilemez. Normal Çalıştır bu komutları çalıştırabilir; veritabanı kullanıcı yetkileri uygulanır.
- Her çalıştırma ve aktarım ayrı bir bağlantı kullanır. Tek seferde **tek SQL komutu** desteklenir; sekmeler arasında açık transaction/session tutulmaz. Parametreler yukarıda açıklanan giriş alanlarından alınır.
- CSV biçimi seçiminden **Excel (Türkçe / UTF-8)** varsayılan olarak seçilir: UTF-8 BOM, noktalı virgül sütun ayırıcı ve sayısal PostgreSQL sütunlarında ondalık virgül kullanılır. Örneğin `1234.56::numeric` CSV'ye `1234,56` yazılır. Metin kodları, tarihler ve JSON içindeki noktalar değiştirilmez. **Eski Excel (Windows-1254)** aynı Türkçe ayırıcılarla eski kodlamayı kullanır; bu kodlamaya sığmayan emoji/karakter varsa sessizce bozulmak yerine işlem durur ve UTF-8/Excel önerilir. **Standart (UTF-8)** eski davranışı korur: UTF-8 BOM, virgül sütun ve nokta ondalık ayırıcı. Bütün biçimler çift tırnak kaçışı ve CRLF kullanır; `sep=` gibi ek veri satırı yazılmaz.
- PostgreSQL `numeric` ve `bigint` değerleri hassasiyet kaybolmaması için Excel'e metin olarak yazılır. NULL boş hücre olur; JSON ve diziler metindir. DATE değerleri saat dilimine çevrilmeden `YYYY-MM-DD` olarak korunur; zaman damgaları ISO biçimindedir.
- Excel'in sayfa sınırını aşan sonuçlar yeni sayfalara bölünür (her sayfada başlık + en fazla 1.048.575 veri satırı). Hücre metni 32.767 karakteri aşıyorsa aktarım açıklayıcı hatayla durur; bu veriler için CSV kullanın.
- Hata veya iptalde tamamlanmamış dosya temizlenir. Var olan hedef dosya ancak aktarım başarıyla tamamlandığında değiştirilir. **İptal** PostgreSQL'e aynı kullanıcıyla sorgu iptal isteği yollar.
- Çok büyük aktarımlarda yeterli disk alanı ve bağlantı süresi gerekir. Satır sınırı olmaması her boyutta verinin her bilgisayarda test edildiği anlamına gelmez.

CSV kendi içinde sütun türü taşımaz. Excel dosyayı açarken Windows bölge ayarlarına göre yorumlar. Türkiye dışındaki ayarlarda **Veri → Metinden/CSV** ile kodlama, ayırıcı ve Türkçe sayı yerel ayarını seçin. Özellikle 15 anlamlı rakamı geçen kimlik/tutarlar, baştaki sıfırlar ve çok hassas değerler için **Excel indir (XLSX)** kullanın; CSV'nin otomatik tür tahminine güvenmeyin.

## Güncellemeler

Sol panelde **Güncellemeleri kontrol et** düğmesi bulunur. Paketlenmiş uygulama açılıştan 5 saniye sonra ve açık kaldığı sürece 6 saatte bir GitHub'daki en yeni kararlı sürümü kontrol eder. Yeni sürüm bulunduğunda düğmede sürüm numarası görünür; indirme kendiliğinden başlamaz.

**İndir** dosyayı akışla `İndirilenler/Sade SQL` klasörüne kaydeder. GitHub'ın yayınladığı SHA-256 özeti ve dosya boyutu doğrulanmadan uygulama açılmaz. Kesik/bozuk indirmeler temizlenir; mevcut EXE değiştirilmez. **Yeni sürümü aç** mevcut pencereyi kapatıp indirilen sürümü başlatır. İşlem devam ederken açma engellenir; kaydedilmemiş sorgu varsa normal kapatma onayı gösterilir. Bağlantılar ve kayıtlı sorgular aynı kullanıcı veri klasöründe korunur. Sonraki açılışlarda yeni EXE'yi kullanın; eski EXE'ye bağlı masaüstü kısayolunu yeni dosyaya yönlendirin. Bu, taşınabilir uygulama güncellemesidir; Windows kurulumunu veya eski dosyanın üstüne yazmayı kullanmaz.

İnternet/GitHub erişimi yoksa sorgu çalıştırma etkilenmez; düğmeden tekrar kontrol edebilirsiniz. GitHub hesabı veya API anahtarı gerekmez. Yalnızca `tguduk42/sade_sql` deposunun kararlı `vX.Y.Z` yayınları ve sürümle eşleşen Windows EXE'si kabul edilir; dosyanın SHA-256 bilgisi yayında bulunmalıdır. Bu dosya bütünlüğü kontrolüdür; Windows kod imzası yerine geçmez. Güncelleme özelliği 1.0.5 ile gelir: 1.0.4 ve önceki sürümlerde ilk geçiş için 1.0.5 EXE'sini elle indirin.

## Kayıtların saklanması

Bağlantılar ve sorgular `%APPDATA%/sade-sql/workspace.json` içinde saklanır (gerçek klasör Electron kullanıcı veri dizinidir). Yedeklemek için uygulamayı kapatıp bu dosyayı kopyalayın. Kaydedilmiş SQL içinde yazdığınız sabit değerler de bu dosyada bulunur.

**Parolayı hatırla** seçilirse Windows `safeStorage` şifrelemesi kullanılır. Parola arayüze geri gönderilmez ve düz metin dosyaya yazılmaz. Seçilmezse parola yalnızca o uygulama oturumunda bellektedir. SSL doğrulama modu işletim sistemi/Node sertifika deposunu kullanır; özel CA dosyası seçme arayüzü bu sürümde yoktur.

Sorgular ve bağlantı bilgileri harici bir servise gönderilmez. Paketlenmiş uygulama açıldıktan sonra ve 6 saatte bir GitHub Releases üzerinden yeni sürüm kontrolü yapar; bu bağlantı GitHub ile normal HTTPS isteği bilgilerini paylaşır. PostgreSQL bağlantıları masaüstü ana işleminde kurulur; arayüzde Node erişimi yoktur. EXE dijital kod imzası içermez.

## Geliştirme

Node.js 22+ ile:

```powershell
npm ci
npm start
npm run dist
```

Kaynak kod MIT lisanslıdır. Electron, node-postgres, pg-query-stream ve ExcelJS kullanılır. Bağımlılık lisansları dağıtımdaki paketlerde yer alır.

## Doğrulama

Yerel geçici PostgreSQL 18.6 ile veritabanı entegrasyon testleri çalıştırıldı. Testler mevcut veritabanlarını kullanmaz; geçici bir cluster oluşturur, sadece `127.0.0.1` üzerinde rastgele portta başlatır ve sonunda durdurur.

```powershell
$env:PG_BIN = 'C:\path\to\pgsql\bin'
npm test
```

Test kapsamı: 1.000 satır önizleme, aynı isimli sütunlar, boş sonuçların başlıkları, 100.000 satır CSV, 25.000 satır Excel, Türkçe karakterler, CSV tırnak/yeni satır kaçışı, büyük sayı hassasiyeti, salt okunur aktarım, hatada mevcut dosyanın korunması, iptal ve sorgu kayıtlarının kalıcılığı.

`scripts/smoke.cjs` Playwright Electron ile gerçek pencere üzerinde bağlantı testi, Windows parola şifrelemesi, sorguyu kaydetme/yeniden açma, uygulama yeniden başlatma, 25.000 satır CSV ve Excel aktarımını kontrol eder. Otomasyonda yalnızca yerel dosya seçme penceresinin hedefi sağlanır; düğmeler, IPC, PostgreSQL ve dosya yazıcıları gerçektir. Playwright test ortamında ayrıca bulunmalıdır (`PLAYWRIGHT_MODULE` ile modül yolu verilebilir). `SADE_SQL_EXE` ile paketlenmiş EXE test edilebilir.

Kullanıcının gerçek uzak veritabanı, özel SSL/SSH altyapısı ve Microsoft Excel uygulamasında dosya açılması bu yerel testlerden ayrıdır. Bu sürüm SSH tünelini kendisi kurmaz.
