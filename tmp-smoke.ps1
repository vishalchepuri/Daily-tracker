$base = 'http://127.0.0.1:3010'
function Invoke-Smoke($name, $method, $path, $body = $null) {
  $uri = $base + $path
  $headers = @{}
  $bodyJson = $null
  if ($null -ne $body) { $headers['Content-Type'] = 'application/json'; $bodyJson = $body | ConvertTo-Json -Depth 10 }
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    $res = Invoke-WebRequest -Uri $uri -Method $method -Headers $headers -Body $bodyJson -TimeoutSec 30 -UseBasicParsing
    $sw.Stop()
    return [pscustomobject]@{Name=$name; Method=$method; Path=$path; Status=[int]$res.StatusCode; Ms=$sw.ElapsedMilliseconds; Body=([string]$res.Content).Substring(0,[Math]::Min(120,([string]$res.Content).Length)) -replace "`n", ' '}
  } catch [System.Net.WebException] {
    $sw.Stop()
    $resp = $_.Exception.Response
    if ($resp) {
      $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
      $content = $reader.ReadToEnd()
      return [pscustomobject]@{Name=$name; Method=$method; Path=$path; Status=[int]$resp.StatusCode; Ms=$sw.ElapsedMilliseconds; Body=$content.Substring(0,[Math]::Min(120,$content.Length)) -replace "`n", ' '}
    }
    return [pscustomobject]@{Name=$name; Method=$method; Path=$path; Status='ERR'; Ms=$sw.ElapsedMilliseconds; Body=$_.Exception.Message}
  } catch {
    $sw.Stop()
    return [pscustomobject]@{Name=$name; Method=$method; Path=$path; Status='ERR'; Ms=$sw.ElapsedMilliseconds; Body=$_.Exception.Message}
  }
}
$tests = @(
  @('home','GET','/',$null), @('login','GET','/login',$null), @('signup','GET','/signup',$null), @('terms','GET','/terms',$null), @('privacy','GET','/privacy',$null),
  @('health','GET','/api/health',$null), @('exercises public','GET','/api/exercises?compact=1',$null), @('issue report public','POST','/api/issue-reports',@{message='Smoke test issue report from API test'; page='API smoke'; category='test'}), @('check email','POST','/api/auth/check-email',@{email='smoke@example.com'}),
  @('activity','GET','/api/activity',$null), @('dashboard api','GET','/api/dashboard',$null), @('food logs get','GET','/api/food-logs',$null), @('food logs post','POST','/api/food-logs',@{}), @('workout templates get','GET','/api/workout-templates',$null), @('workout logs get','GET','/api/workout-logs',$null), @('profile get','GET','/api/profile',$null), @('progress get','GET','/api/progress',$null), @('progress photos get','GET','/api/progress-photos',$null), @('review items get','GET','/api/review-items',$null), @('chat sessions get','GET','/api/chat/sessions',$null), @('chat get','GET','/api/chat',$null), @('spends get','GET','/api/spends',$null), @('bank accounts get','GET','/api/bank-accounts',$null), @('credit cards get','GET','/api/credit-cards',$null), @('finance get','GET','/api/finance',$null), @('money links get','GET','/api/money-links',$null), @('reminder lists get','GET','/api/reminder-lists',$null), @('reminders get','GET','/api/reminders',$null), @('medications get','GET','/api/medications',$null), @('medication logs get','GET','/api/medications/logs',$null), @('water logs get','GET','/api/water-logs',$null), @('diet plans get','GET','/api/diet-plans',$null), @('personal records get','GET','/api/personal-records',$null), @('youtube feed get','GET','/api/youtube/feed',$null), @('youtube subscriptions get','GET','/api/youtube/subscriptions',$null), @('youtube videos get','GET','/api/youtube/videos',$null), @('telegram settings get','GET','/api/telegram-settings',$null),
  @('auth session delete','DELETE','/api/auth/firebase-session',$null), @('auth session post missing token','POST','/api/auth/firebase-session',@{}), @('youtube summary post','POST','/api/youtube/summary',@{}), @('upload presigned post','POST','/api/upload/presigned',@{}), @('workout replace post','POST','/api/workouts/replace-exercise',@{}), @('profile reset post','POST','/api/profile/reset-data',@{}), @('retention post','POST','/api/retention',$null), @('telegram poll post','POST','/api/telegram/poll',$null), @('telegram webhook post','POST','/api/telegram/webhook',@{}), @('account delete','DELETE','/api/account',$null)
)
$results = foreach ($t in $tests) { Invoke-Smoke $t[0] $t[1] $t[2] $t[3] }
$results | Format-Table -AutoSize
$bad = $results | Where-Object { $_.Status -eq 'ERR' -or ([int]$_.Status -ge 500) }
if ($bad) { Write-Output "FAILURES:"; $bad | Format-List; exit 1 }
