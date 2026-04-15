const fs = require('fs');
const path = require('path');

class PersistentStorage {
  constructor(filename) {
    this.filePath = path.join(__dirname, filename);
    this.data = this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading persistent storage:', error);
    }
    return { lastProcessedTime: 0, processedTxs: {} };
  }

  save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data), 'utf8');
    } catch (error) {
      console.error('Error saving persistent storage:', error);
    }
  }

  getLastProcessedTime() {
    return this.data.lastProcessedTime;
  }

  setLastProcessedTime(timestamp) {
    this.data.lastProcessedTime = timestamp;
    this.save();
  }

  hasProcessedTx(txId) {
    return !!this.data.processedTxs[txId];
  }

  markTxProcessed(txId) {
    this.data.processedTxs[txId] = true;
    this.save();
  }
}

module.exports = PersistentStorage; 