import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const WIDTH = 636;
const HEIGHT = 1048;
const OUT_DIR = path.join(process.cwd(), 'public', 'onboarding');
const FONT = 'Apple SD Gothic Neo, NanumGothic, Arial Unicode MS, sans-serif';

const palette = {
  ink: '#111827',
  muted: '#8B95A1',
  line: '#E7ECF2',
  surface: '#FFFFFF',
  canvas: '#F5F7FA',
  blue: '#3B82F6',
  blueDark: '#2563EB',
  blueSoft: '#EFF6FF',
  red: '#EF4444',
  redSoft: '#FEF2F2',
  pink: '#EC4899',
  pinkSoft: '#FDF2F8',
  amber: '#F59E0B',
  amberSoft: '#FFFBEB',
  emerald: '#10B981',
  emeraldSoft: '#ECFDF5',
  violet: '#8B5CF6',
  violetSoft: '#F5F3FF',
  slateSoft: '#F8FAFC',
};

const iconPng = await fs.readFile(path.join(process.cwd(), 'public', 'icon.png'));
const iconHref = `data:image/png;base64,${iconPng.toString('base64')}`;

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function text(lines, x, y, options = {}) {
  const {
    size = 24,
    weight = 700,
    fill = palette.ink,
    lineHeight = Math.round(size * 1.32),
    anchor = 'start',
    opacity = 1,
    letterSpacing = 0,
  } = options;
  const parts = Array.isArray(lines) ? lines : [lines];
  const tspans = parts.map((line, index) => {
    const dy = index === 0 ? 0 : lineHeight;
    return `<tspan x="${x}" dy="${dy}">${esc(line)}</tspan>`;
  }).join('');
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" opacity="${opacity}" letter-spacing="${letterSpacing}">${tspans}</text>`;
}

function rect(x, y, w, h, r, fill, options = {}) {
  const { stroke = 'none', strokeWidth = 1, opacity = 1, filter = '' } = options;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" ${filter ? `filter="${filter}"` : ''}/>`;
}

function circle(cx, cy, r, fill, options = {}) {
  const { opacity = 1, stroke = 'none', strokeWidth = 1 } = options;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="${opacity}" stroke="${stroke}" stroke-width="${strokeWidth}"/>`;
}

function line(x1, y1, x2, y2, options = {}) {
  const { stroke = palette.line, strokeWidth = 2, opacity = 1, dash = '' } = options;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
}

function iconPath(kind, x, y, options = {}) {
  const { color = palette.ink, size = 22, strokeWidth = 2.2, fill = 'none', opacity = 1 } = options;
  const s = size / 24;
  const tx = (n) => x + n * s;
  const ty = (n) => y + n * s;
  const common = `stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" fill="${fill}" opacity="${opacity}"`;
  const fillOnly = `fill="${color}" opacity="${opacity}"`;
  if (kind === 'home') {
    return `<path d="M ${tx(3)} ${ty(11)} L ${tx(12)} ${ty(4)} L ${tx(21)} ${ty(11)} M ${tx(5)} ${ty(10)} V ${ty(20)} H ${tx(19)} V ${ty(10)}" ${common}/>`;
  }
  if (kind === 'calendar') {
    return `<rect x="${tx(4)}" y="${ty(5)}" width="${18 * s}" height="${16 * s}" rx="${4 * s}" ${common}/><path d="M ${tx(8)} ${ty(3)} V ${ty(7)} M ${tx(18)} ${ty(3)} V ${ty(7)} M ${tx(4)} ${ty(10)} H ${tx(22)}" ${common}/>`;
  }
  if (kind === 'clipboard') {
    return `<rect x="${tx(6)}" y="${ty(5)}" width="${14 * s}" height="${17 * s}" rx="${3 * s}" ${common}/><rect x="${tx(9)}" y="${ty(2.5)}" width="${8 * s}" height="${5 * s}" rx="${2.5 * s}" ${common}/><path d="M ${tx(9)} ${ty(13)} H ${tx(17)} M ${tx(9)} ${ty(17)} H ${tx(15)}" ${common}/>`;
  }
  if (kind === 'book') {
    return `<path d="M ${tx(5)} ${ty(4)} H ${tx(13)} C ${tx(16)} ${ty(4)} ${tx(18)} ${ty(6)} ${tx(18)} ${ty(9)} V ${ty(20)} H ${tx(9)} C ${tx(7)} ${ty(20)} ${tx(5)} ${ty(18)} ${tx(5)} ${ty(16)} Z" ${common}/><path d="M ${tx(18)} ${ty(7)} H ${tx(21)} V ${ty(20)} H ${tx(18)}" ${common}/><circle cx="${tx(11)}" cy="${ty(10)}" r="${2.3 * s}" ${common}/><path d="M ${tx(8.5)} ${ty(16)} C ${tx(9.5)} ${ty(14)} ${tx(12.5)} ${ty(14)} ${tx(13.5)} ${ty(16)}" ${common}/>`;
  }
  if (kind === 'user') {
    return `<circle cx="${tx(12)}" cy="${ty(8)}" r="${4 * s}" ${common}/><path d="M ${tx(4.5)} ${ty(21)} C ${tx(6.5)} ${ty(16)} ${tx(17.5)} ${ty(16)} ${tx(19.5)} ${ty(21)}" ${common}/>`;
  }
  if (kind === 'heart') {
    return `<path d="M ${tx(12)} ${ty(20)} C ${tx(8)} ${ty(16.5)} ${tx(4)} ${ty(13)} ${tx(4)} ${ty(8.8)} C ${tx(4)} ${ty(6.2)} ${tx(6)} ${ty(4.5)} ${tx(8.4)} ${ty(4.5)} C ${tx(10)} ${ty(4.5)} ${tx(11.2)} ${ty(5.3)} ${tx(12)} ${ty(6.5)} C ${tx(12.8)} ${ty(5.3)} ${tx(14)} ${ty(4.5)} ${tx(15.6)} ${ty(4.5)} C ${tx(18)} ${ty(4.5)} ${tx(20)} ${ty(6.2)} ${tx(20)} ${ty(8.8)} C ${tx(20)} ${ty(13)} ${tx(16)} ${ty(16.5)} ${tx(12)} ${ty(20)} Z" ${fillOnly}/>`;
  }
  if (kind === 'flower') {
    return `<path d="M ${tx(12)} ${ty(13)} C ${tx(8)} ${ty(10)} ${tx(8)} ${ty(5)} ${tx(12)} ${ty(4)} C ${tx(16)} ${ty(5)} ${tx(16)} ${ty(10)} ${tx(12)} ${ty(13)} Z M ${tx(12)} ${ty(13)} C ${tx(8)} ${ty(16)} ${tx(5)} ${ty(14)} ${tx(4)} ${ty(10)} M ${tx(12)} ${ty(13)} C ${tx(16)} ${ty(16)} ${tx(19)} ${ty(14)} ${tx(20)} ${ty(10)} M ${tx(12)} ${ty(13)} V ${ty(21)}" ${common}/>`;
  }
  if (kind === 'spark') {
    return `<path d="M ${tx(12)} ${ty(3)} L ${tx(14.5)} ${ty(9.5)} L ${tx(21)} ${ty(12)} L ${tx(14.5)} ${ty(14.5)} L ${tx(12)} ${ty(21)} L ${tx(9.5)} ${ty(14.5)} L ${tx(3)} ${ty(12)} L ${tx(9.5)} ${ty(9.5)} Z" ${fillOnly}/>`;
  }
  return '';
}

function phoneFrame(content, options = {}) {
  const {
    x = 92,
    y = 250,
    w = 452,
    h = 770,
    bg = '#F8FAFC',
    title = '마음정산',
    subtitle = '이번 달 마음 흐름',
    activeTab = '홈',
    showTitle = true,
  } = options;
  const tabs = [
    { label: '홈', icon: 'home' },
    { label: '달력', icon: 'calendar' },
    { label: '내역', icon: 'clipboard' },
    { label: '연락처', icon: 'book' },
    { label: 'MY', icon: 'user' },
  ];
  const tabW = w / tabs.length;
  const nav = tabs.map((tab, i) => {
    const cx = x + tabW * i + tabW / 2;
    const isActive = tab.label === activeTab;
    const color = isActive ? palette.blue : '#A7B0BC';
    return [
      isActive ? rect(cx - 14, y + h - 76, 28, 4, 2, palette.blue) : '',
      iconPath(tab.icon, cx - 11, y + h - 61, { size: 22, color, strokeWidth: isActive ? 2.5 : 1.8 }),
      text(tab.label, cx, y + h - 18, {
        size: 12,
        weight: 800,
        fill: color,
        anchor: 'middle',
      }),
    ].join('');
  }).join('');

  return `
    ${rect(x, y, w, h, 42, '#111827', { opacity: 0.08, filter: 'url(#shadowPhone)' })}
    ${rect(x, y, w, h, 42, '#111827')}
    ${rect(x + 10, y + 10, w - 20, h - 20, 34, bg)}
    ${rect(x + 174, y + 20, 104, 7, 4, '#111827', { opacity: 0.24 })}
    ${showTitle ? text(title, x + 36, y + 70, { size: 29, weight: 900 }) : ''}
    ${showTitle ? text(subtitle, x + 36, y + 96, { size: 15, weight: 700, fill: palette.muted }) : ''}
    ${content}
    ${rect(x + 10, y + h - 92, w - 20, 82, 30, '#FFFFFF', { stroke: '#EEF2F7' })}
    ${nav}
  `;
}

function appBadge() {
  return `
    <g transform="translate(44 48)">
      ${rect(0, 0, 178, 48, 24, '#FFFFFF', { stroke: '#E5EDF7' })}
      <image href="${iconHref}" x="8" y="8" width="32" height="32" clip-path="url(#iconClip)"/>
      ${text('마음정산', 50, 30, { size: 18, weight: 900 })}
    </g>
  `;
}

function base(slideNo, headline, subhead, body, accent = palette.blue) {
  return `
  <svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="shadowCard" x="-20%" y="-20%" width="140%" height="150%">
        <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#0F172A" flood-opacity="0.09"/>
      </filter>
      <filter id="shadowPhone" x="-20%" y="-20%" width="140%" height="150%">
        <feDropShadow dx="0" dy="20" stdDeviation="18" flood-color="#0F172A" flood-opacity="0.15"/>
      </filter>
      <clipPath id="iconClip"><rect x="8" y="8" width="32" height="32" rx="10"/></clipPath>
      <clipPath id="homeIconClip"><rect x="126" y="292" width="40" height="40" rx="14"/></clipPath>
    </defs>
    ${rect(0, 0, WIDTH, HEIGHT, 0, '#FFFFFF')}
    ${rect(0, 0, WIDTH, HEIGHT, 0, palette.canvas)}
    ${rect(0, 0, WIDTH, 214, 0, '#FFFFFF')}
    ${rect(0, 214, WIDTH, 2, 0, '#EDF2F7')}
    ${appBadge()}
    ${text(`0${slideNo}`, 560, 78, { size: 18, weight: 900, fill: accent, anchor: 'middle' })}
    ${text(headline, 44, 148, { size: 34, weight: 900, lineHeight: 44, fill: palette.ink })}
    ${text(subhead, 44, 194, { size: 17, weight: 700, lineHeight: 25, fill: palette.muted })}
    ${body}
  </svg>`;
}

function chip(x, y, label, options = {}) {
  const { fill = palette.blueSoft, color = palette.blueDark, icon = '' } = options;
  const width = Math.max(76, label.length * 17 + (icon ? 48 : 34));
  return `
    ${rect(x, y, width, 34, 17, fill)}
    ${icon ? text(icon, x + 20, y + 23, { size: 17, weight: 800, fill: color, anchor: 'middle' }) : ''}
    ${text(label, x + (icon ? 38 : 17), y + 23, { size: 14, weight: 900, fill: color })}
  `;
}

function homeTop(x = 126, y = 296) {
  return `
    <image href="${iconHref}" x="${x}" y="${y}" width="40" height="40" clip-path="url(#homeIconClip)"/>
    ${text('마음정산', x + 52, y + 27, { size: 18, weight: 900, fill: '#030712' })}
    ${rect(x + 244, y + 2, 116, 36, 18, '#030712')}
    ${circle(x + 261, y + 20, 3.5, '#34D399')}
    ${text('토스로 로그인', x + 272, y + 24, { size: 12, weight: 900, fill: '#FFFFFF' })}
  `;
}

function summaryTile(x, y, label, value, tone = 'blue') {
  const color = tone === 'blue' ? palette.blueDark : tone === 'red' ? palette.red : '#6B7280';
  return `
    ${rect(x, y, 116, 78, 20, '#FFFFFF', { stroke: '#EEF2F7' })}
    ${text(label, x + 15, y + 27, { size: 12, weight: 800, fill: palette.muted })}
    ${text(value, x + 15, y + 59, { size: 18, weight: 900, fill: color })}
  `;
}

function homeRecentRow(x, y, name, detail, amount, tone = 'expense', icon = 'heart', isLast = false) {
  const color = tone === 'income' ? palette.blueDark : palette.red;
  const soft = tone === 'income' ? palette.blueSoft : palette.redSoft;
  const sign = tone === 'income' ? '+' : '-';
  return `
    ${!isLast ? line(x + 16, y + 68, x + 356, y + 68, { stroke: '#EEF2F7', strokeWidth: 1 }) : ''}
    ${rect(x + 16, y + 15, 40, 40, 13, soft)}
    ${iconPath(icon, x + 25, y + 24, { size: 22, color, strokeWidth: 2.1, fill: icon === 'heart' || icon === 'spark' ? color : 'none' })}
    ${text(name, x + 70, y + 36, { size: 15, weight: 900 })}
    ${text(detail, x + 70, y + 58, { size: 11, weight: 700, fill: palette.muted })}
    ${text(`${sign}${amount}`, x + 348, y + 39, { size: 15, weight: 900, fill: color, anchor: 'end' })}
    ${text(tone === 'income' ? '받음' : '보냄', x + 348, y + 58, { size: 10, weight: 700, fill: '#CBD5E1', anchor: 'end' })}
  `;
}

function historyRow(x, y, name, detail, amount, tone = 'expense', icon = 'heart') {
  const color = tone === 'income' ? palette.blueDark : palette.red;
  const soft = tone === 'income' ? palette.blueSoft : palette.redSoft;
  const sign = tone === 'income' ? '+' : '-';
  return `
    ${rect(x, y, 384, 60, 18, '#FFFFFF', { stroke: '#EEF2F7' })}
    ${rect(x, y, 4, 60, 2, tone === 'income' ? palette.blue : '#F87171')}
    ${rect(x + 18, y + 12, 36, 36, 12, soft)}
    ${iconPath(icon, x + 26, y + 20, { size: 20, color, fill: icon === 'heart' || icon === 'spark' ? color : 'none' })}
    ${rect(x + 66, y + 17, 26, 15, 4, tone === 'income' ? palette.blue : palette.red)}
    ${text(tone === 'income' ? 'IN' : 'OUT', x + 79, y + 28.5, { size: 8, weight: 900, fill: '#FFFFFF', anchor: 'middle' })}
    ${text(name, x + 100, y + 30, { size: 15, weight: 900 })}
    ${text(detail, x + 66, y + 48, { size: 10, weight: 700, fill: palette.muted })}
    ${text(`${sign}${amount}`, x + 334, y + 35, { size: 14, weight: 900, fill: color, anchor: 'end' })}
    ${text('⌫', x + 363, y + 36, { size: 15, weight: 800, fill: '#D1D5DB', anchor: 'middle' })}
  `;
}

function entryCard(x, y, name, meta, amount, tone = 'expense', event = '♥') {
  const color = tone === 'income' ? palette.blueDark : palette.red;
  const soft = tone === 'income' ? palette.blueSoft : palette.redSoft;
  const sign = tone === 'income' ? '+' : '-';
  return `
    ${rect(x, y, 364, 78, 21, '#FFFFFF', { stroke: '#EEF2F7' })}
    ${rect(x + 16, y + 17, 44, 44, 14, soft)}
    ${text(event, x + 38, y + 48, { size: 20, weight: 900, fill: color, anchor: 'middle' })}
    ${text(name, x + 74, y + 35, { size: 18, weight: 900 })}
    ${text(meta, x + 74, y + 58, { size: 13, weight: 700, fill: palette.muted })}
    ${text(`${sign}${amount}`, x + 338, y + 43, { size: 18, weight: 900, fill: color, anchor: 'end' })}
  `;
}

function compactEntryCard(x, y, name, meta, amount, tone = 'expense', event = '♥') {
  const color = tone === 'income' ? palette.blueDark : palette.red;
  const soft = tone === 'income' ? palette.blueSoft : palette.redSoft;
  const sign = tone === 'income' ? '+' : '-';
  return `
    ${rect(x, y, 364, 64, 19, '#FFFFFF', { stroke: '#EEF2F7' })}
    ${rect(x + 14, y + 15, 34, 34, 12, soft)}
    ${text(event, x + 31, y + 38, { size: 17, weight: 900, fill: color, anchor: 'middle' })}
    ${text(name, x + 62, y + 27, { size: 16, weight: 900 })}
    ${text(meta, x + 62, y + 49, { size: 12, weight: 700, fill: palette.muted })}
    ${text(`${sign}${amount}`, x + 338, y + 37, { size: 16, weight: 900, fill: color, anchor: 'end' })}
  `;
}

function slide01() {
  const content = `
    ${homeTop(126, 292)}
    ${text('안녕하세요, 손님', 126, 382, { size: 14, weight: 900, fill: palette.blue })}
    ${text('어떤 마음을 정산할까요?', 126, 418, { size: 24, weight: 900 })}
    ${text('링크·이미지·메시지를 AI가 정리해요.', 126, 448, { size: 13, weight: 800, fill: palette.muted })}
    ${rect(126, 472, 384, 130, 22, '#FFFFFF', { stroke: '#EEF2F7' })}
    ${text('청첩장 또는 부고장 URL을 붙여넣으세요...', 148, 510, { size: 14, weight: 800, fill: '#9CA3AF' })}
    ${line(148, 546, 488, 546, { stroke: '#F1F5F9', strokeWidth: 1 })}
    ${text('⌁', 162, 580, { size: 13, weight: 900, fill: '#4B5563', anchor: 'middle' })}
    ${text('카메라', 194, 580, { size: 11, weight: 900, fill: '#4B5563', anchor: 'middle' })}
    ${text('▣', 246, 580, { size: 13, weight: 900, fill: '#4B5563', anchor: 'middle' })}
    ${text('앨범', 274, 580, { size: 11, weight: 900, fill: '#4B5563', anchor: 'middle' })}
    ${rect(312, 558, 72, 36, 16, palette.blueSoft)}
    ${text('↗', 330, 581, { size: 13, weight: 900, fill: palette.blueDark, anchor: 'middle' })}
    ${text('URL', 356, 580, { size: 12, weight: 900, fill: palette.blueDark, anchor: 'middle' })}
    ${text('+', 406, 580, { size: 14, weight: 900, fill: '#4B5563', anchor: 'middle' })}
    ${text('직접', 430, 580, { size: 11, weight: 900, fill: '#4B5563', anchor: 'middle' })}
    ${rect(462, 557, 34, 34, 17, '#E5E7EB')}
    ${text('➤', 479, 581, { size: 14, weight: 900, fill: '#9CA3AF', anchor: 'middle' })}
    ${text('이번 달 마음정산', 126, 638, { size: 15, weight: 900 })}
    ${summaryTile(126, 656, '받은 마음', '36만원', 'blue')}
    ${summaryTile(260, 656, '보낸 마음', '24만원', 'red')}
    ${summaryTile(394, 656, '합계', '+12만원', 'blue')}
    ${text('최근 내역', 126, 772, { size: 15, weight: 900 })}
    ${rect(126, 790, 384, 138, 20, '#FFFFFF', { stroke: '#EEF2F7' })}
    ${homeRecentRow(126, 790, '김하윤', '결혼 · 6월 14일', '10만원', 'expense', 'heart')}
    ${homeRecentRow(126, 858, '박민준', '부고 · 6월 8일', '5만원', 'income', 'flower', true)}
  `;
  const body = phoneFrame(content, {
    activeTab: '홈',
    showTitle: false,
  });
  return base(1, '경조사비를 한곳에서', '보낸 마음과 받은 마음을 헷갈리지 않게 정리해요', body, palette.blue);
}

function slide02() {
  const content = `
    ${homeTop(126, 292)}
    ${text('어떤 마음을 정산할까요?', 126, 382, { size: 22, weight: 900 })}
    ${rect(126, 414, 384, 126, 22, '#FFFFFF', { stroke: '#EEF2F7' })}
    ${text('https://wedding.example/doyoon-seoyeon', 148, 454, { size: 14, weight: 800, fill: palette.ink })}
    ${line(148, 488, 488, 488, { stroke: '#F1F5F9', strokeWidth: 1 })}
    ${chip(146, 502, 'URL', { icon: '↗', fill: palette.blueSoft, color: palette.blueDark })}
    ${rect(458, 499, 34, 34, 17, palette.blue)}
    ${text('➤', 475, 523, { size: 14, weight: 900, fill: '#FFFFFF', anchor: 'middle' })}
    ${rect(102, 590, 432, 340, 32, '#FFFFFF', { stroke: '#EEF2F7', filter: 'url(#shadowCard)' })}
    ${rect(288, 604, 60, 4, 2, '#D1D5DB')}
    ${text('✦ AI 분석 완료', 126, 642, { size: 13, weight: 900, fill: palette.blueDark })}
    ${text('내용을 확인해주세요', 126, 674, { size: 22, weight: 900 })}
    ${rect(126, 704, 384, 42, 17, '#F8FAFC', { stroke: '#E5E7EB' })}
    ${rect(130, 708, 186, 34, 13, '#FFFFFF', { stroke: '#FEE2E2' })}
    ${text('보낸 마음', 224, 731, { size: 13, weight: 900, fill: palette.red, anchor: 'middle' })}
    ${text('받은 마음', 414, 731, { size: 13, weight: 900, fill: '#6B7280', anchor: 'middle' })}
    ${rect(126, 760, 384, 54, 16, '#FFFFFF', { stroke: '#EEF2F7' })}
    ${text('이름', 146, 781, { size: 11, weight: 900, fill: palette.muted })}
    ${rect(178, 768, 22, 18, 6, palette.blue)}
    ${text('AI', 189, 781.5, { size: 9, weight: 900, fill: '#FFFFFF', anchor: 'middle' })}
    ${text('김도윤·이서연', 146, 802, { size: 16, weight: 900 })}
    ${rect(126, 824, 184, 48, 16, '#FFFFFF', { stroke: '#EEF2F7' })}
    ${text('날짜', 146, 843, { size: 11, weight: 900, fill: palette.muted })}
    ${text('2026.06.14', 146, 862, { size: 15, weight: 900 })}
    ${rect(326, 824, 184, 48, 16, '#FFFFFF', { stroke: '#EEF2F7' })}
    ${text('장소', 346, 843, { size: 11, weight: 900, fill: palette.muted })}
    ${text('라움아트센터', 346, 862, { size: 15, weight: 900 })}
    ${rect(126, 882, 384, 42, 14, palette.blue)}
    ${text('저장하기', 318, 910, { size: 16, weight: 900, fill: '#FFFFFF', anchor: 'middle' })}
  `;
  const body = phoneFrame(content, {
    activeTab: '홈',
    showTitle: false,
  });
  return base(2, '청첩장 링크로 자동 입력', 'AI가 이름·날짜·장소·계좌번호를 채워줘요', body, palette.blueDark);
}

function slide03() {
  const content = `
    ${rect(102, 260, 432, 126, 34, '#FFFFFF')}
    ${text('전체 내역', 126, 328, { size: 24, weight: 900 })}
    ${text('30건의 기록', 126, 354, { size: 13, weight: 800, fill: palette.muted })}
    ${rect(310, 304, 52, 36, 13, '#F3F4F6')}
    ${text('선택', 336, 327, { size: 11, weight: 900, fill: '#4B5563', anchor: 'middle' })}
    ${rect(370, 304, 68, 36, 13, '#F3F4F6')}
    ${text('내보내기', 404, 327, { size: 11, weight: 900, fill: '#4B5563', anchor: 'middle' })}
    ${rect(446, 304, 64, 36, 13, palette.blueSoft)}
    ${text('가져오기', 478, 327, { size: 11, weight: 900, fill: palette.blueDark, anchor: 'middle' })}
    ${rect(126, 416, 384, 48, 16, '#FFFFFF', { stroke: '#EEF2F7' })}
    ${text('⌕', 150, 447, { size: 18, weight: 900, fill: '#D1D5DB', anchor: 'middle' })}
    ${text('이름, 결혼·부고·생일, 장소, 관계 검색...', 174, 447, { size: 13, weight: 800, fill: '#A7B0BC' })}
    ${rect(126, 482, 384, 42, 14, '#FFFFFF', { stroke: '#EEF2F7' })}
    ${rect(130, 486, 122, 34, 12, palette.blue)}
    ${text('전체', 191, 509, { size: 12, weight: 900, fill: '#FFFFFF', anchor: 'middle' })}
    ${text('보낸 마음', 318, 509, { size: 12, weight: 900, fill: palette.muted, anchor: 'middle' })}
    ${text('받은 마음', 446, 509, { size: 12, weight: 900, fill: palette.muted, anchor: 'middle' })}
    ${historyRow(126, 548, '최지훈', '26.06.14 · 결혼 · 회사 동료', '10만원', 'expense', 'heart')}
    ${historyRow(126, 622, '정유진', '26.05.21 · 생일 · 친구', '3만원', 'income', 'spark')}
    ${historyRow(126, 696, '이현우', '26.05.08 · 부고 · 지인', '5만원', 'expense', 'flower')}
    ${historyRow(126, 770, '박민준', '26.04.30 · 결혼 · 대학 친구', '7만원', 'income', 'heart')}
  `;
  const body = phoneFrame(content, {
    activeTab: '내역',
    showTitle: false,
  });
  return base(3, '보낸 마음과 받은 마음 관리', '검색과 필터로 필요한 기록을 바로 찾아요', body, palette.red);
}

function calendarGrid(x, y) {
  const labels = ['일', '월', '화', '수', '목', '금', '토'];
  const dates = Array.from({ length: 35 }, (_, i) => i + 1);
  const cell = 48;
  const row = 41;
  const header = labels.map((d, i) => text(d, x + i * cell + 24, y, {
    size: 12,
    weight: 900,
    fill: palette.muted,
    anchor: 'middle',
  })).join('');
  const days = dates.map((d, i) => {
    const cx = x + (i % 7) * cell + 24;
    const cy = y + 34 + Math.floor(i / 7) * row;
    const active = d === 14;
    const hasExpense = [3, 14, 22, 28].includes(d);
    const hasIncome = [8, 14, 25].includes(d);
    return `
      ${active ? rect(cx - 19, cy - 20, 38, 38, 14, palette.blue) : ''}
      ${text(d, cx, cy + 5, { size: 15, weight: 900, fill: active ? '#FFFFFF' : palette.ink, anchor: 'middle' })}
      ${hasExpense ? circle(cx - 5, cy + 18, 3.5, palette.red) : ''}
      ${hasIncome ? circle(cx + 5, cy + 18, 3.5, palette.blueDark) : ''}
    `;
  }).join('');
  return `${header}${days}`;
}

function slide04() {
  const content = `
    ${rect(408, 302, 102, 34, 17, palette.blueSoft)}
    ${iconPath('calendar', 424, 309, { size: 14, color: palette.blueDark, strokeWidth: 2 })}
    ${text('캘린더로', 468, 324, { size: 11, weight: 900, fill: palette.blueDark, anchor: 'middle' })}
    ${rect(126, 396, 384, 312, 28, '#FFFFFF', { stroke: '#EEF2F7' })}
    ${text('2026년 6월', 318, 440, { size: 22, weight: 900, anchor: 'middle' })}
    ${calendarGrid(150, 480)}
    ${text('6월 14일 일정 (2)', 130, 748, { size: 15, weight: 900, fill: palette.muted })}
    ${rect(126, 772, 384, 78, 21, '#FFFFFF', { stroke: '#EEF2F7' })}
    ${rect(142, 789, 44, 44, 14, palette.redSoft)}
    ${text('♥', 164, 820, { size: 20, weight: 900, fill: palette.red, anchor: 'middle' })}
    ${text('김도윤·이서연', 200, 804, { size: 18, weight: 900 })}
    ${text('라움아트센터', 200, 829, { size: 13, weight: 700, fill: palette.muted })}
    ${text('-10만원', 474, 802, { size: 16, weight: 900, fill: palette.red, anchor: 'end' })}
    ${rect(374, 814, 100, 28, 10, palette.blueSoft)}
    ${text('캘린더로', 424, 833, { size: 12, weight: 900, fill: palette.blueDark, anchor: 'middle' })}
  `;
  const body = phoneFrame(content, {
    activeTab: '달력',
    title: '경조사 달력',
    subtitle: '월별·일별 일정을 확인하세요',
  });
  return base(4, '일정까지 놓치지 않게', '월별 경조사를 보고 캘린더로 내보내요', body, palette.emerald);
}

function donut(cx, cy) {
  return `
    <path d="M ${cx} ${cy - 62} A 62 62 0 0 1 ${cx + 60} ${cy + 15}" fill="none" stroke="${palette.red}" stroke-width="20" stroke-linecap="round"/>
    <path d="M ${cx + 60} ${cy + 15} A 62 62 0 0 1 ${cx - 15} ${cy + 60}" fill="none" stroke="${palette.amber}" stroke-width="20" stroke-linecap="round"/>
    <path d="M ${cx - 15} ${cy + 60} A 62 62 0 0 1 ${cx - 58} ${cy - 20}" fill="none" stroke="${palette.violet}" stroke-width="20" stroke-linecap="round"/>
    <path d="M ${cx - 58} ${cy - 20} A 62 62 0 0 1 ${cx} ${cy - 62}" fill="none" stroke="${palette.blueDark}" stroke-width="20" stroke-linecap="round"/>
    ${circle(cx, cy, 38, '#FFFFFF')}
    ${text('행사별', cx, cy - 3, { size: 14, weight: 900, fill: palette.muted, anchor: 'middle' })}
    ${text('비중', cx, cy + 24, { size: 22, weight: 900, anchor: 'middle' })}
  `;
}

function slide05() {
  const content = `
    ${rect(102, 260, 432, 116, 34, '#FFFFFF')}
    ${text('MY', 126, 326, { size: 24, weight: 900 })}
    ${text('나의 활동과 설정', 126, 352, { size: 13, weight: 800, fill: palette.muted })}
    ${text('⚙', 496, 326, { size: 22, weight: 800, fill: '#9CA3AF', anchor: 'middle' })}
    ${rect(126, 404, 384, 92, 20, '#FFFFFF', { stroke: '#EEF2F7' })}
    ${circle(158, 450, 28, '#DBEAFE')}
    ${text('토', 158, 458, { size: 23, weight: 900, fill: palette.blueDark, anchor: 'middle' })}
    ${text('토스 사용자', 202, 440, { size: 18, weight: 900 })}
    ${text('토스 계정 연결됨', 202, 466, { size: 12, weight: 800, fill: palette.muted })}
    ${text('내 크레딧', 130, 536, { size: 12, weight: 900, fill: palette.muted })}
    ${rect(126, 550, 184, 126, 20, palette.blueSoft)}
    ${iconPath('spark', 150, 570, { size: 16, color: palette.blueDark, fill: palette.blueDark })}
    ${text('AI 분석', 174, 583, { size: 12, weight: 900, fill: palette.blueDark })}
    ${text('3', 150, 630, { size: 36, weight: 900, fill: palette.blueDark })}
    ${text('회', 193, 630, { size: 14, weight: 900, fill: palette.blueDark })}
    ${text('최대 5회 보관', 150, 652, { size: 10, weight: 800, fill: palette.muted })}
    ${rect(150, 662, 120, 24, 9, palette.blue)}
    ${text('광고 보고 +1회', 210, 679, { size: 11, weight: 900, fill: '#FFFFFF', anchor: 'middle' })}
    ${rect(326, 550, 184, 126, 20, palette.violetSoft)}
    ${text('▾', 350, 584, { size: 16, weight: 900, fill: palette.violet })}
    ${text('대량 가져오기', 374, 583, { size: 12, weight: 900, fill: palette.violet })}
    ${text('2', 350, 630, { size: 36, weight: 900, fill: palette.violet })}
    ${text('회', 393, 630, { size: 14, weight: 900, fill: palette.violet })}
    ${text('최대 3회 보관', 350, 652, { size: 10, weight: 800, fill: palette.muted })}
    ${rect(350, 662, 120, 24, 9, palette.violet)}
    ${text('광고 보고 +1회', 410, 679, { size: 11, weight: 900, fill: '#FFFFFF', anchor: 'middle' })}
    ${text('나의 통계', 130, 724, { size: 12, weight: 900, fill: palette.muted })}
    ${rect(126, 740, 384, 174, 22, '#FFFFFF', { stroke: '#EEF2F7' })}
    ${summaryTile(142, 760, '받은 마음', '92만원', 'blue')}
    ${summaryTile(260, 760, '보낸 마음', '126만원', 'red')}
    ${summaryTile(378, 760, '합계', '-34만원', 'red')}
    ${rect(142, 858, 344, 42, 14, '#F3F4F6')}
    ${rect(146, 862, 168, 34, 11, '#FFFFFF')}
    ${text('받은 마음', 230, 885, { size: 12, weight: 900, fill: palette.blueDark, anchor: 'middle' })}
    ${text('보낸 마음', 400, 885, { size: 12, weight: 900, fill: palette.red, anchor: 'middle' })}
  `;
  const body = `
    ${phoneFrame(content, {
      activeTab: 'MY',
      showTitle: false,
    })}
  `;
  return base(5, '통계와 크레딧도 깔끔하게', '관계별 통계와 광고 충전을 MY 탭에서 확인해요', body, palette.violet);
}

// ─── 새 온보딩 슬라이드 ───────────────────────────────────────────

function aiFormField(x, y, w, label, value, aiTag = false) {
  const bg = aiTag ? '#EFF6FF' : '#F9FAFB';
  const border = aiTag ? '#BFDBFE' : '#E5E7EB';
  return `
    ${rect(x, y, w, 50, 16, bg, { stroke: border })}
    ${text(label, x + 14, y + 18, { size: 11, weight: 900, fill: '#9CA3AF' })}
    ${text(value, x + 14, y + 38, { size: 14, weight: 900 })}
    ${aiTag ? rect(x + w - 38, y + 16, 24, 17, 5, palette.blue) : ''}
    ${aiTag ? text('AI', x + w - 26, y + 28, { size: 9, weight: 900, fill: '#FFFFFF', anchor: 'middle' }) : ''}
  `;
}

function depositRow(x, y, name, date, amount, selected = true) {
  return `
    ${rect(x, y, 390, 56, 16, '#FFFFFF', { stroke: selected ? '#BFDBFE' : '#E5E7EB' })}
    ${rect(x + 14, y + 18, 20, 20, 6, selected ? palette.blue : '#E5E7EB')}
    ${selected ? text('✓', x + 24, y + 33, { size: 12, weight: 900, fill: '#FFFFFF', anchor: 'middle' }) : ''}
    ${text(name, x + 48, y + 25, { size: 15, weight: 900 })}
    ${text(date, x + 48, y + 44, { size: 11, weight: 700, fill: '#9CA3AF' })}
    ${text('+' + amount, x + 376, y + 33, { size: 15, weight: 900, fill: palette.blueDark, anchor: 'end' })}
  `;
}

function csvRow(x, y, name, type, date, amount, isHeader = false) {
  const fill = isHeader ? '#F9FAFB' : '#FFFFFF';
  const fontW = isHeader ? 900 : 700;
  const color = isHeader ? '#374151' : '#111827';
  return `
    ${rect(x, y, 390, 40, isHeader ? 8 : 0, fill, { stroke: '#E5E7EB' })}
    ${text(name, x + 12, y + 26, { size: 12, weight: fontW, fill: color })}
    ${text(type, x + 106, y + 26, { size: 12, weight: fontW, fill: isHeader ? color : palette.muted })}
    ${text(date, x + 190, y + 26, { size: 12, weight: fontW, fill: isHeader ? color : palette.muted })}
    ${text(amount, x + 378, y + 26, { size: 12, weight: fontW, fill: isHeader ? color : (isHeader ? color : palette.blueDark), anchor: 'end' })}
  `;
}

function slideAi01() {
  const cx = 126;
  const cw = 390;
  const content = `
    ${homeTop(cx, 292)}
    ${text('안녕하세요, 손님', cx, 355, { size: 13, weight: 700, fill: '#6B7280' })}
    ${rect(cx, 372, cw, 34, 17, '#EFF6FF')}
    ${text('✦  AI 분석 완료! 내용을 확인해주세요', cx + 14, 394, { size: 12, weight: 900, fill: palette.blueDark })}
    ${rect(cx, 414, cw, 36, 16, '#F9FAFB', { stroke: '#E5E7EB' })}
    ${rect(cx + 2, 416, cw / 2 - 4, 32, 13, '#FFFFFF', { stroke: '#FEE2E2' })}
    ${text('↗  보낸 마음', cx + cw / 4, 437, { size: 12, weight: 900, fill: '#EF4444', anchor: 'middle' })}
    ${text('↙  받은 마음', cx + 3 * cw / 4, 437, { size: 12, weight: 900, fill: '#9CA3AF', anchor: 'middle' })}
    ${aiFormField(cx, 458, cw, '이름', '김민지', true)}
    ${aiFormField(cx, 516, cw, '날짜', '2026.06.14 (일)', true)}
    ${rect(cx, 574, cw, 86, 16, '#FFFFFF', { stroke: '#E5E7EB' })}
    ${text('종류', cx + 14, 592, { size: 11, weight: 900, fill: '#9CA3AF' })}
    ${rect(cx + 14, 598, 82, 48, 13, '#FFFFFF', { stroke: '#3B82F6' })}
    ${text('결혼', cx + 55, 628, { size: 12, weight: 900, fill: '#3B82F6', anchor: 'middle' })}
    ${rect(cx + 104, 598, 82, 48, 13, '#FFFFFF', { stroke: '#E5E7EB' })}
    ${text('부고', cx + 145, 628, { size: 12, weight: 700, fill: '#9CA3AF', anchor: 'middle' })}
    ${rect(cx + 194, 598, 82, 48, 13, '#FFFFFF', { stroke: '#E5E7EB' })}
    ${text('생일', cx + 235, 628, { size: 12, weight: 700, fill: '#9CA3AF', anchor: 'middle' })}
    ${rect(cx + 284, 598, 82, 48, 13, '#FFFFFF', { stroke: '#E5E7EB' })}
    ${text('기타', cx + 325, 628, { size: 12, weight: 700, fill: '#9CA3AF', anchor: 'middle' })}
    ${aiFormField(cx, 668, cw, '장소', '라움아트센터', true)}
    ${aiFormField(cx, 726, cw, '관계', '친구', false)}
  `;
  return base(1, 'AI가 폼을 채워줘요', '이름·날짜·장소를 자동으로 입력해요', phoneFrame(content, { activeTab: '홈', showTitle: false }), palette.blue);
}

function slideAi02() {
  const cx = 126;
  const cw = 390;
  const content = `
    ${homeTop(cx, 292)}
    ${text('안녕하세요, 손님', cx, 355, { size: 13, weight: 700, fill: '#6B7280' })}
    ${rect(cx, 378, cw, 210, 24, '#FFFFFF', { stroke: '#F0F0F0', filter: 'url(#shadowCard)' })}
    ${text('금액', cx + 16, 402, { size: 13, weight: 900, fill: '#6B7280' })}
    ${rect(cx + 14, 418, 44, 44, 18, '#F3F4F6')}
    ${text('−', cx + 36, 447, { size: 24, weight: 300, fill: '#374151', anchor: 'middle' })}
    ${text('10', cx + cw / 2 - 10, 468, { size: 52, weight: 900, anchor: 'end' })}
    ${text('만원', cx + cw / 2 + 36, 463, { size: 18, weight: 900, fill: '#6B7280' })}
    ${rect(cx + cw - 58, 418, 44, 44, 18, '#F3F4F6')}
    ${text('+', cx + cw - 36, 447, { size: 24, weight: 300, fill: '#374151', anchor: 'middle' })}
    ${rect(cx + 14, 492, 84, 36, 12, '#FFFFFF', { stroke: '#E5E7EB' })}
    ${text('-1만', cx + 56, 516, { size: 12, weight: 900, fill: '#374151', anchor: 'middle' })}
    ${rect(cx + 106, 492, 84, 36, 12, '#FFFFFF', { stroke: '#E5E7EB' })}
    ${text('+1만', cx + 148, 516, { size: 12, weight: 900, fill: '#374151', anchor: 'middle' })}
    ${rect(cx + 198, 492, 84, 36, 12, '#FFFFFF', { stroke: '#E5E7EB' })}
    ${text('+5만', cx + 240, 516, { size: 12, weight: 900, fill: '#374151', anchor: 'middle' })}
    ${rect(cx + 290, 492, 84, 36, 12, '#FFFFFF', { stroke: '#E5E7EB' })}
    ${text('+10만', cx + 332, 516, { size: 12, weight: 900, fill: '#374151', anchor: 'middle' })}
    ${rect(cx + 14, 538, cw - 28, 42, 18, '#EFF6FF')}
    ${iconPath('spark', cx + 26, 548, { size: 18, color: palette.blue, fill: palette.blue })}
    ${text('친구 관계와 예식장 정보를 보고 추천했어요', cx + 50, 565, { size: 12, weight: 900, fill: palette.blueDark })}
    ${rect(cx, 608, cw, 50, 16, '#F9FAFB', { stroke: '#E5E7EB' })}
    ${text('계좌번호', cx + 14, 627, { size: 11, weight: 900, fill: '#9CA3AF' })}
    ${rect(cx + 48, 613, 26, 18, 6, palette.blue)}
    ${text('AI', cx + 61, 627, { size: 9, weight: 900, fill: '#FFFFFF', anchor: 'middle' })}
    ${text('토스뱅크 1000-1234-5678 김민지', cx + 84, 641, { size: 12, weight: 900 })}
    ${rect(cx, 680, cw, 54, 20, palette.blue)}
    ${text('저장하기', cx + cw / 2, 713, { size: 16, weight: 900, fill: '#FFFFFF', anchor: 'middle' })}
  `;
  return base(2, '금액도 추천해줘요', '과거 기록과 관계를 분석해 보낼 금액을 추천해요', phoneFrame(content, { activeTab: '홈', showTitle: false }), palette.blueDark);
}

function slideImport01() {
  const cx = 126;
  const cw = 390;
  const content = `
    ${rect(102, 260, 452, 760, 34, palette.canvas)}
    ${rect(102, 440, 452, 600, 34, '#111827', { opacity: 0.3 })}
    ${rect(102, 500, 452, 530, 34, '#FFFFFF')}
    ${rect(280, 512, 52, 5, 2.5, '#D1D5DB')}
    ${text('대량 가져오기', cx, 554, { size: 21, weight: 900 })}
    ${text('7건의 받은 마음이 감지됐어요', cx, 578, { size: 13, weight: 700, fill: '#9CA3AF' })}
    ${depositRow(cx, 596, '김민지', '26.06.14 · 결혼', '10만원', true)}
    ${depositRow(cx, 660, '이서연', '26.06.08 · 결혼', '5만원', true)}
    ${depositRow(cx, 724, '박준혁', '26.05.30 · 생일', '3만원', true)}
    ${depositRow(cx, 788, '최유진', '26.05.22 · 부고', '7만원', true)}
    ${rect(cx, 860, cw, 56, 20, palette.blue)}
    ${text('7건 가져오기', cx + cw / 2, 893, { size: 16, weight: 900, fill: '#FFFFFF', anchor: 'middle' })}
    ${rect(102, 930, 452, 90, 0, '#FFFFFF')}
  `;
  return base(1, '입금 내역을 분석해요', '카카오페이·토스 이미지에서 받은 마음을 자동 인식해요', content, palette.blue);
}

function slideImport02() {
  const cx = 126;
  const cw = 390;
  const content = `
    ${rect(102, 260, 452, 760, 34, palette.canvas)}
    ${rect(102, 440, 452, 600, 34, '#111827', { opacity: 0.3 })}
    ${rect(102, 480, 452, 560, 34, '#FFFFFF')}
    ${rect(280, 492, 52, 5, 2.5, '#D1D5DB')}
    ${text('대량 가져오기', cx, 534, { size: 21, weight: 900 })}
    ${text('15건의 기록이 감지됐어요', cx, 558, { size: 13, weight: 700, fill: '#9CA3AF' })}
    ${csvRow(cx, 572, '이름', '종류', '날짜', '금액', true)}
    ${csvRow(cx, 612, '김민지', '결혼', '26.06.14', '+10만원', false)}
    ${csvRow(cx, 652, '박준혁', '생일', '26.05.30', '+3만원', false)}
    ${csvRow(cx, 692, '이현우', '부고', '26.05.08', '+5만원', false)}
    ${csvRow(cx, 732, '정유진', '결혼', '26.04.22', '+10만원', false)}
    ${csvRow(cx, 772, '최지훈', '결혼', '26.04.10', '+7만원', false)}
    ${rect(cx, 825, cw, 26, 13, '#F3F4F6')}
    ${text('외 10건 더 있어요', cx + cw / 2, 843, { size: 12, weight: 700, fill: '#9CA3AF', anchor: 'middle' })}
    ${rect(cx, 862, cw, 56, 20, palette.blue)}
    ${text('15건 가져오기', cx + cw / 2, 895, { size: 16, weight: 900, fill: '#FFFFFF', anchor: 'middle' })}
    ${rect(102, 930, 452, 90, 0, '#FFFFFF')}
  `;
  return base(2, 'CSV도 가져올 수 있어요', '기존 엑셀·스프레드시트를 CSV로 내보내면 한번에 가져와요', content, palette.violet);
}

const slides = [
  ['maeum-onboarding-01-overview.png', slide01()],
  ['maeum-onboarding-02-ai-analysis.png', slide02()],
  ['maeum-onboarding-03-history.png', slide03()],
  ['maeum-onboarding-04-calendar.png', slide04()],
  ['maeum-onboarding-05-my-stats.png', slide05()],
  ['maeum-onboarding-ai-01-parse.png', slideAi01()],
  ['maeum-onboarding-ai-02-amount.png', slideAi02()],
  ['maeum-onboarding-import-01-deposit.png', slideImport01()],
  ['maeum-onboarding-import-02-csv.png', slideImport02()],
];

await fs.mkdir(OUT_DIR, { recursive: true });

for (const [filename, svg] of slides) {
  const outPath = path.join(OUT_DIR, filename);
  await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(outPath);
  const metadata = await sharp(outPath).metadata();
  if (metadata.width !== WIDTH || metadata.height !== HEIGHT) {
    throw new Error(`${filename} has wrong size: ${metadata.width}x${metadata.height}`);
  }
  console.log(`${filename} ${metadata.width}x${metadata.height}`);
}
