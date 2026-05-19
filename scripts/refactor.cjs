const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) { 
      if (!file.includes('node_modules') && !file.includes('.git') && !file.includes('dist')) {
        results = results.concat(walk(fullPath));
      }
    } else { 
      if (fullPath.match(/\.(tsx|ts)$/)) results.push(fullPath);
    }
  });
  return results;
}

const files = walk('d:/Code/miki');
files.forEach(file => {
  if (file.endsWith('types.ts')) return; 
  
  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;
  
  content = content.replace(/\bRoom\b/g, 'Equipment')
                   .replace(/\bRooms\b/g, 'Equipments')
                   .replace(/\broomId\b/g, 'equipmentId')
                   .replace(/\broomName\b/g, 'equipmentName')
                   .replace(/\broomsCount\b/g, 'equipmentsCount')
                   .replace(/\brooms\b/g, 'equipments')
                   .replace(/\bCheckIn\b/g, 'UsageLog')
                   .replace(/\bCheckIns\b/g, 'UsageLogs')
                   .replace(/\bcheckIn\b/g, 'usageLog')
                   .replace(/\bcheckins\b/g, 'usageLogs')
                   .replace(/\bCheckInType\b/g, 'UsageLogType')
                   .replace(/\bReport\b/g, 'IncidentReport')
                   .replace(/\breport\b/g, 'incidentReport')
                   .replace(/\breports\b/g, 'incidentReports')
                   .replace(/\bEstablishment\b/g, 'EquipmentCategory')
                   .replace(/\bestablishment\b/g, 'equipmentCategory')
                   .replace(/\bestablishments\b/g, 'equipmentCategories')
                   .replace(/\bEstablishments\b/g, 'EquipmentCategories')
                   .replace(/\bestablishmentId\b/g, 'categoryId')
                   .replace(/\bDepartment\b/g, 'EquipmentBrand')
                   .replace(/\bdepartment\b/g, 'equipmentBrand')
                   .replace(/\bdepartments\b/g, 'equipmentBrands')
                   .replace(/\bDepartments\b/g, 'EquipmentBrands')
                   .replace(/\bdepartmentId\b/g, 'brandId')
                   .replace(/\bENTRY\b/g, 'START')
                   .replace(/\bEXIT\b/g, 'STOP');
  
  if (content !== originalContent) {
    fs.writeFileSync(file, content, 'utf8');
    console.log('Updated ' + file);
  }
});
