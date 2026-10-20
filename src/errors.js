function describeError(error) {
  const errors = [error, ...(Array.isArray(error?.errors) ? error.errors : [])].filter(Boolean);
  const has = code => errors.some(item => item.code === code);
  if (has('ECONNREFUSED')) return 'PostgreSQL bağlantısı reddedildi. Sunucu adresini ve portu kontrol edin. Docker kullanıyorsanız veritabanı portunun Windows’a açık olması gerekir.';
  if (has('ENOTFOUND') || has('EAI_AGAIN')) return 'Sunucu adresi bulunamadı. Docker servis adı (örn. postgres) Windows’tan çözümlenmez; erişilebilir IP adresi veya localhost kullanın.';
  if (has('ETIMEDOUT') || errors.some(item => /^(connection terminated due to connection timeout|timeout expired|connection timeout)$/i.test(item.message || ''))) return 'PostgreSQL bağlantısı zaman aşımına uğradı. Sunucu, port, VPN ve güvenlik duvarı ayarlarını kontrol edin.';
  if (has('28P01')) return 'PostgreSQL kullanıcı adı veya parolası hatalı.';
  if (has('3D000')) return 'Belirtilen PostgreSQL veritabanı bulunamadı. Veritabanı adını kontrol edin.';
  if (has('EACCES') || has('EPERM')) return 'Dosyaya erişim izni yok. Yazma izniniz olan bir klasör seçin veya dosyayı kullanan uygulamayı kapatın.';
  return errors.map(item => item.message?.trim()).find(Boolean) || 'İşlem tamamlanamadı. Bağlantı ayarlarını kontrol edip yeniden deneyin.';
}
module.exports = { describeError };
