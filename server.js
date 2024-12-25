const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const mqtt = require('mqtt');

const app = express();
const port = 3001;

const mqttTopics = ['bme680/p1', 'bme680/p2', 'bme680/p3', 'bme680/p4', 'bme680/p5'];
const mqttTopics1 = ['health/t1', 'health/t2', 'health/t3', 'health/t4'];
const watertopics = ['water/a1'];
const planttopics = ['plant/p1', 'plant/p2'];

app.use(cors());
app.use(bodyParser.json());
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let sensorData = {};
let healthData = {};
let waterData = {};
let plantData = {};

const mqttClient = mqtt.connect('mqtt://34.29.202.158:1883');

mqttClient.on('connect', () => {
  console.log('Connected to broker');
  mqttClient.subscribe([...mqttTopics, ...mqttTopics1, ...watertopics, ...planttopics]);
});

mqttClient.on('message', (topic, message) => {
  const dataMap = {
    ...mqttTopics.reduce((acc, topic, idx) => ({ ...acc, [topic]: 'sensor' + (idx + 1) }), {}),
    ...mqttTopics1.reduce((acc, topic, idx) => ({ ...acc, [topic]: 'value' + (idx + 1) }), {}),
    ...watertopics.reduce((acc, topic, idx) => ({ ...acc, [topic]: 'water' + (idx + 1) }), {}),
    ...planttopics.reduce((acc, topic, idx) => ({ ...acc, [topic]: 'val' + (idx + 1) }), {}),
  };

  if (dataMap[topic]) {
    const dataKey = dataMap[topic];
    const data = { [dataKey]: message.toString() };

    // Directly update the correct data object
    if (dataKey.startsWith('sensor')) {
      sensorData = { ...sensorData, ...data };
    } else if (dataKey.startsWith('value')) {
      healthData = { ...healthData, ...data };
    } else if (dataKey.startsWith('water')) {
      waterData = { ...waterData, ...data };
    } else if (dataKey.startsWith('val')) {
      plantData = { ...plantData, ...data };
    }

    console.log(`Received data for ${dataKey}: ${data[dataKey]}`);
    wss.clients.forEach(client => client.readyState === WebSocket.OPEN && client.send(JSON.stringify(data)));
  }
});

wss.on('connection', (ws) => {
  console.log('WebSocket connection established');
  ws.send(JSON.stringify({ buttonState: 'off' }));

  ws.on('message', (message) => {
    console.log(`Received message from client: ${message}`);
    const data = message.toString();

    if (data.startsWith('on_command_') || data.startsWith('off_command_')) {
      const [command, _, switchIndex] = data.split('_');
      const switchStates = Array(12).fill(false);
      const state = command === 'on';

      if (switchIndex >= 0 && switchIndex < switchStates.length) {
        switchStates[switchIndex] = state;
        const mqttTopic = `home/automation/switch_${switchIndex + 1}`;
        const mqttMessage = state ? 'on' : 'off';

        mqttClient.publish(mqttTopic, mqttMessage, (err) => {
          if (err) console.error('Error publishing MQTT message:', err);
          else console.log(`MQTT message sent to ${mqttTopic}: ${mqttMessage}`);
        });

        ws.send(JSON.stringify({
          status: 'success',
          message: `Switch ${switchIndex + 1} is now ${state ? 'ON' : 'OFF'}`,
        }));
      }
    }
  });

  ws.on('close', () => console.log('Client disconnected'));
  ws.on('error', (error) => console.error('WebSocket error:', error));
});

app.get('/sensorData', (req, res) => res.json(sensorData));
app.get('/healthData', (req, res) => res.json(healthData));
app.get('/waterData', (req, res) => res.json(waterData));
app.get('/plantData', (req, res) => res.json(plantData));

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
