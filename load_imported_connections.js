#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// 获取连接配置文件路径
function getConnectionsFilePath() {
  const userDataPath = app.getPath('userData');
  const connectionsDir = path.join(userDataPath, 'connections');
  
  // 确保目录存在
  if (!fs.existsSync(connectionsDir)) {
    fs.mkdirSync(connectionsDir, { recursive: true });
  }
  
  return path.join(connectionsDir, 'connections.json');
}

// 加载导入的连接到MySSH应用
async function loadImportedConnections() {
  const importedFilePath = path.join(__dirname, 'imported_connections.json');
  
  if (!fs.existsSync(importedFilePath)) {
    console.error('导入的连接文件不存在:', importedFilePath);
    return;
  }
  
  try {
    // 读取导入的连接
    const importedData = fs.readFileSync(importedFilePath, 'utf8');
    const importedConnections = JSON.parse(importedData);
    
    console.log(`读取到 ${importedConnections.length} 个导入的连接`);
    
    // 获取MySSH应用的连接文件路径
    const appConnectionsPath = getConnectionsFilePath();
    
    // 读取现有连接（如果存在）
    let existingConnections = [];
    if (fs.existsSync(appConnectionsPath)) {
      const existingData = fs.readFileSync(appConnectionsPath, 'utf8');
      existingConnections = JSON.parse(existingData);
      console.log(`现有连接: ${existingConnections.length} 个`);
    }
    
    // 合并连接（避免重复）
    const allConnections = [...existingConnections];
    let addedCount = 0;
    
    importedConnections.forEach(newConn => {
      // 检查是否已存在相同的连接
      const exists = existingConnections.some(existing => 
        existing.host === newConn.host && 
        existing.port === newConn.port && 
        existing.username === newConn.username
      );
      
      if (!exists) {
        allConnections.push(newConn);
        addedCount++;
      } else {
        console.log(`跳过重复连接: ${newConn.name} (${newConn.username}@${newConn.host}:${newConn.port})`);
      }
    });
    
    // 保存到MySSH应用配置文件
    fs.writeFileSync(appConnectionsPath, JSON.stringify(allConnections, null, 2), 'utf8');
    
    console.log(`\n导入完成!`);
    console.log(`- 新增连接: ${addedCount} 个`);
    console.log(`- 总连接数: ${allConnections.length} 个`);
    console.log(`- 配置文件路径: ${appConnectionsPath}`);
    
    // 按分组统计
    const groupStats = {};
    allConnections.forEach(conn => {
      const group = conn.group || '根目录';
      groupStats[group] = (groupStats[group] || 0) + 1;
    });
    
    console.log('\n最终分组统计:');
    Object.entries(groupStats).forEach(([group, count]) => {
      console.log(`  ${group}: ${count} 个连接`);
    });
    
    return allConnections;
  } catch (error) {
    console.error('导入连接失败:', error);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  // 由于需要electron环境，这里提供一个简化版本
  const importedFilePath = path.join(__dirname, 'imported_connections.json');
  const outputPath = path.join(__dirname, 'connections.json');
  
  if (fs.existsSync(importedFilePath)) {
    const data = fs.readFileSync(importedFilePath, 'utf8');
    fs.writeFileSync(outputPath, data, 'utf8');
    console.log(`连接配置已复制到: ${outputPath}`);
    console.log('请手动将此文件导入到MySSH应用中，或者在MySSH应用运行时执行此脚本。');
  } else {
    console.error('导入文件不存在:', importedFilePath);
  }
}

module.exports = {
  loadImportedConnections,
  getConnectionsFilePath
};
