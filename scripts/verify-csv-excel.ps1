param([string]$Directory = (Join-Path $PSScriptRoot '..\test-output\csv-locale'))
$ErrorActionPreference = 'Stop'
$excelTest = New-Object -ComObject Excel.Application
$excelTest.Visible = $false
$excelTest.DisplayAlerts = $false
try {
  foreach ($mode in @('excel-tr', 'excel-tr-legacy', 'standard')) {
    $source = (Resolve-Path (Join-Path $Directory ($mode + '.csv'))).Path
    # .txt forces Excel's explicit text importer; .csv can override supplied
    # options using the host's regional settings (this test host is en-US).
    $file = Join-Path ([IO.Path]::GetDirectoryName($source)) ([Guid]::NewGuid().ToString() + '.txt')
    Copy-Item -LiteralPath $source -Destination $file
    $origin = if ($mode -eq 'excel-tr-legacy') { 1254 } else { 65001 }
    $turkish = $mode -ne 'standard'
    $decimal = if ($turkish) { ',' } else { '.' }
    $group = if ($turkish) { '.' } else { ',' }
    # Explicit import options emulate the selected locale without changing
    # Windows region settings or the user's Excel separator preferences.
    $fieldInfo = @(@(1, 2), @(2, 1), @(3, 1), @(4, 1), @(5, 2))
    $excelTest.Workbooks.OpenText($file, $origin, 1, 1, 1, $false, $false, $turkish, (-not $turkish), $false, $false, '|', $fieldInfo, 1, $decimal, $group)
    $book = $excelTest.ActiveWorkbook
    try {
      $sheet = $book.Worksheets.Item(1)
      if ($sheet.UsedRange.Columns.Count -ne 5) { throw 'CSV sütun sayısı yanlış.' }
      if ($sheet.Cells.Item(2, 1).Value2 -cne 'Çağrı İıŞşĞğÜüÖöÇç') { throw 'Türkçe karakterler değişti.' }
      if ($sheet.Cells.Item(2, 2).Value2 -ne 1234.56) { throw '1234.56 tutarı değişti.' }
      if ($sheet.Cells.Item(2, 3).Value2 -ne -12.34) { throw 'Negatif tutar değişti.' }
      if ($sheet.Cells.Item(2, 4).Value2 -ne 0.18) { throw 'Ondalık oran değişti.' }
      Write-Output ('PASS: Microsoft Excel import ' + $mode + ': Türkçe ve 1234.56 / -12.34 / 0.18 doğrulandı.')
    } finally {
      $book.Close($false)
      [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($sheet)
      [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($book)
      Remove-Item -LiteralPath $file
    }
  }
} finally {
  $excelTest.Quit()
  [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($excelTest)
}
