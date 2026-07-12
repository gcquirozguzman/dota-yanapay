param(
  [string]$Locale = "es-ES",
  [string]$WakeWord = "yanapay",
  [int]$QuestionTimeoutSeconds = 10,
  [double]$MinimumConfidence = 0.45
)

$ErrorActionPreference = "Stop"

function Send-Event([hashtable]$Event) {
  [Console]::Out.WriteLine(($Event | ConvertTo-Json -Compress))
  [Console]::Out.Flush()
}

try {
  Add-Type -AssemblyName System.Speech
  $recognizers = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
  $selected = $recognizers | Where-Object { $_.Culture.Name -eq $Locale } | Select-Object -First 1
  if (-not $selected) {
    $selected = $recognizers | Where-Object { $_.Culture.TwoLetterISOLanguageName -eq "es" } | Select-Object -First 1
  }
  if (-not $selected) { throw "No hay reconocimiento de voz instalado en Windows." }

  $engine = [System.Speech.Recognition.SpeechRecognitionEngine]::new($selected.Culture)
  try { $engine.UpdateRecognizerSetting("CFGConfidenceRejectionThreshold", 20) } catch {}
  try { $engine.UpdateRecognizerSetting("ResourceUsage", 80) } catch {}
  try { $engine.UpdateRecognizerSetting("AdaptationOn", 1) } catch {}
  $dictationGrammar = [System.Speech.Recognition.DictationGrammar]::new()
  $dictationGrammar.Name = "free-dictation"
  $engine.LoadGrammar($dictationGrammar)
  $engine.SetInputToDefaultAudioDevice()

  Send-Event @{ type = "ready"; locale = $selected.Culture.Name; wakeWord = $WakeWord }

  while ($true) {
    $result = $engine.Recognize([TimeSpan]::FromSeconds(5))
    if (-not $result) { continue }
    if ($result.Confidence -lt $MinimumConfidence) { continue }
    $text = $result.Text.Trim()
    $wakeDetected = $text -match '(?i)^\s*(yanapay|yana\s+pay|llana\s+pay|llanapay)\b'

    if ($wakeDetected) {
      $question = $text -replace '(?i)^\s*(yanapay|yana\s+pay|llana\s+pay|llanapay)[,;:\s-]*', ''
      if (-not [string]::IsNullOrWhiteSpace($question) -and $question.Trim().Length -ge 3) {
        Send-Event @{ type = "wake"; text = $text; confidence = $result.Confidence }
        Send-Event @{ type = "question"; text = $question.Trim(); confidence = $result.Confidence }
      }
    }
  }
} catch {
  Send-Event @{ type = "error"; message = $_.Exception.Message }
  exit 1
}
