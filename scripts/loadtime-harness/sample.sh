#!/system/bin/sh
# On-device sampler: sh /data/local/tmp/sample.sh <pid> <pid> ...
echo T $(date +%s%N)
head -1 /proc/stat
awk 'NR>2{print "N",$1,$2,$10}' /proc/net/dev
echo B $(cat /sys/class/power_supply/battery/temp 2>/dev/null)
echo F $(cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq 2>/dev/null) $(cat /sys/devices/system/cpu/cpu4/cpufreq/scaling_cur_freq 2>/dev/null) $(cat /sys/devices/system/cpu/cpu7/cpufreq/scaling_cur_freq 2>/dev/null)
for p in "$@"; do
  s=$(cat /proc/$p/stat 2>/dev/null)
  [ -n "$s" ] && echo P $p $(echo "$s" | awk '{print $14, $15}')
done
