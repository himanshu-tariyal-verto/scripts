import * as fs from 'fs';
import * as path from 'path';


// Automatically get the latest log file from the logs directory
const logsDir = path.join(__dirname, 'logs');
const logFiles = fs.readdirSync(logsDir)
  .filter(f => f.startsWith('en-service-') && f.endsWith('.log'))
  .sort((a, b) => fs.statSync(path.join(logsDir, b)).mtime.getTime() - fs.statSync(path.join(logsDir, a)).mtime.getTime());
if (logFiles.length === 0) {
  throw new Error('No log files found in logs directory.');
}
const logFilePath = path.join(logsDir, logFiles[0]);

const logLines: string[] = fs.readFileSync(logFilePath, 'utf-8').split('\n');

interface ApiCall {
  start?: Date;
  end?: Date;
}
const apiCalls: Record<string, ApiCall> = {};

for (const line of logLines) {
    
    const vals = line.split(" ")
    const apiId = vals[2]?.replace("[", "").replace("]", ""). replace(" ", "")
    const apiType = vals[3]?.replace("[", "").replace("]", ""). replace(" ", "")
    const time = vals[0]?.replace("[", "").replace("]", "").replace(" ", "")

    if(!apiId || !apiType) continue

    if(!apiCalls[apiId]){
        apiCalls[apiId] = {
            start: undefined,
            end: undefined
        }
    }

    if(apiType === "START"){
        apiCalls[apiId].start = new Date(time) 
    }

    if(apiType === "END"){
        apiCalls[apiId].end = new Date(time) 
    }
    
}

// Print results

const durations: number[] = [];
const durationToId: Record<number, string> = {};
for (const [id, { start, end }] of Object.entries(apiCalls)) {
  if (start && end) {
    const ms = end.getTime() - start.getTime();
    durations.push(ms);
    durationToId[ms] = id;
  }
}

if (durations.length > 0) {
  durations.sort((a, b) => a - b);
  const min = durations[0];
  const max = durations[durations.length - 1];
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  function percentile(p: number) {
    const idx = Math.ceil((p / 100) * durations.length) - 1;
    return durations[Math.max(0, Math.min(idx, durations.length - 1))];
  }
  console.log(`\nSummary:`);
  console.log(`Total calls: ${durations.length}`);
  console.log(`Min: ${min} ms (apiId: ${durationToId[min]})`);
  console.log(`Max: ${max} ms (apiId: ${durationToId[max]})`);
  console.log(`Avg: ${avg.toFixed(2)} ms`);
  console.log(`P50: ${percentile(50)} ms`);
  console.log(`P90: ${percentile(90)} ms`);
  console.log(`P99: ${percentile(99)} ms`);
}