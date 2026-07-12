param(
  [string]$Locale = "es-ES",
  [int]$TimeoutSeconds = 8
)

$ErrorActionPreference = "Stop"

try {
  Add-Type -AssemblyName System.Speech
  $recognizers = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
  if ($recognizers.Count -eq 0) {
    throw "Windows no tiene un paquete de reconocimiento de voz instalado."
  }

  $selected = $recognizers | Where-Object { $_.Culture.Name -eq $Locale } | Select-Object -First 1
  if (-not $selected) {
    $selected = $recognizers | Where-Object { $_.Culture.TwoLetterISOLanguageName -eq "es" } | Select-Object -First 1
  }
  if (-not $selected) {
    $selected = $recognizers | Select-Object -First 1
  }

  $engine = [System.Speech.Recognition.SpeechRecognitionEngine]::new($selected.Culture)
  $engine.LoadGrammar([System.Speech.Recognition.DictationGrammar]::new())
  $engine.SetInputToDefaultAudioDevice()
  $result = $engine.Recognize([TimeSpan]::FromSeconds($TimeoutSeconds))
  $engine.Dispose()

  if (-not $result -or [string]::IsNullOrWhiteSpace($result.Text)) {
    throw "No se detecto ninguna frase."
  }

  @{ text = $result.Text; confidence = $result.Confidence; locale = $selected.Culture.Name } |
    ConvertTo-Json -Compress
} catch {
  @{ error = $_.Exception.Message } | ConvertTo-Json -Compress
  exit 1
}
