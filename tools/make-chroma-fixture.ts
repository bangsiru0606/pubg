// tests/fixtures/chroma_shapes.png 생성: #00FF00 배경 위에 회색 사각형, 청록 원, 검은 외곽선, 부드러운 가장자리의 붉은 도형. (한 번 만들어 커밋)
import sharp from 'sharp';
const W = 96, H = 64;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#00FF00"/>
  <rect x="4" y="8" width="20" height="40" fill="#808080"/>
  <circle cx="44" cy="28" r="14" fill="#008080" stroke="#101010" stroke-width="3"/>
  <circle cx="78" cy="28" r="12" fill="#c83030" filter="url(#b)"/>
  <defs><filter id="b"><feGaussianBlur stdDeviation="1.2"/></filter></defs>
</svg>`;
await sharp(Buffer.from(svg)).png().toFile('tests/fixtures/chroma_shapes.png');
console.log('ok');
