import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// ==========================================
// 1. 배포용 공개 저장소 주소를 본인 주소에 맞게 적어주세요!
// ==========================================
const DEPLOY_REPO_URL = 'https://github.com/leegooninkr/car-log-app-deploy.git'; 

const DIST_DIR = path.resolve('dist');
const TEMP_DEPLOY_DIR = path.resolve('dist-deploy');

try {
  console.log('🔄 1. 모바일 앱 빌드 중 (npm run build)...');
  execSync('npm run build', { stdio: 'inherit' });

  console.log('🔄 2. 배포 폴더 준비 중...');
  if (fs.existsSync(TEMP_DEPLOY_DIR)) {
    fs.rmSync(TEMP_DEPLOY_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEMP_DEPLOY_DIR);

  console.log('🔄 3. 빌드 파일 복사 중...');
  // Copy built files
  if (process.platform === 'win32') {
    execSync(`xcopy /E /I /Y "${DIST_DIR}" "${TEMP_DEPLOY_DIR}"`);
  } else {
    execSync(`cp -R "${DIST_DIR}/" "${TEMP_DEPLOY_DIR}/"`);
  }

  // Create a .nojekyll file to prevent GitHub Pages from ignoring files starting with underscores
  fs.writeFileSync(path.join(TEMP_DEPLOY_DIR, '.nojekyll'), '');

  console.log('🔄 4. 배포용 공개 저장소로 업로드 중 (Git Push)...');
  const gitCmds = [
    'git init',
    'git checkout -b main',
    `git remote add origin ${DEPLOY_REPO_URL}`,
    'git add .',
    'git commit -m "Deploy PWA update"',
    'git push -f origin main'
  ];

  execSync(gitCmds.join(' && '), { cwd: TEMP_DEPLOY_DIR, stdio: 'inherit' });

  console.log('🧹 5. 임시 파일 정리 중...');
  fs.rmSync(TEMP_DEPLOY_DIR, { recursive: true, force: true });
  
  console.log('\n🎉 배포 성공! 소스코드는 안전하게 본인 PC와 비공개 저장소에만 남습니다.');
  console.log('약 1분 뒤 아래 주소로 접속해 스마트폰 홈 화면에 설치해 보세요:');
  console.log(`👉 https://leegooninkr.github.io/car-log-app-deploy/`);

} catch (error) {
  console.error('\n❌ 배포 실패:', error.message);
}
