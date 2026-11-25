/* 点検係のあたま。node からも、ブラウザからも、同じこれを呼びます。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BukaCheck = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  // 言い切ってしまう言葉。カルテの kinshi に足して見ます。
  const DANTEI = ['絶対', '必ず', '誰でも', '確実に', '保証します', '間違いなく', '誰にでも', '必ず続き'];
  // 絵文字と装飾記号
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
  // 数字＋単位（全角数字もひろう）
  const SUJI = /([0-9０-９]+(?:[.．][0-9０-９]+)?)\s*(円|％|%|パーセント|分|秒|時間|日|週|ヶ月|か月|ヵ月|年|本|枚|個|人|割|倍|回|名|ページ|ポイント|万|億)/gu;

  function hankaku(s) {
    return String(s).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/[．]/g, '.').replace(/[，,]/g, '');
  }

  // 「12,000円」の区切りカンマを外しておきます。外さないと 000円 として読んでしまいます。
  function seikika(s) {
    return String(s).replace(/([0-9０-９])[,，]([0-9０-９]{3})/g, '$1$2')
      .replace(/([0-9０-９])[,，]([0-9０-９]{3})/g, '$1$2');
  }

  // カルテから「言ってよい数字」を集めます
  function yurusuSuji(karte) {
    const moto = [];
    const hiroi = (v) => {
      if (v == null) return;
      if (typeof v === 'string' || typeof v === 'number') { moto.push(String(v)); return; }
      if (Array.isArray(v)) { v.forEach(hiroi); return; }
      if (typeof v === 'object') { Object.values(v).forEach(hiroi); }
    };
    hiroi(karte);
    const set = new Set();
    seikika(moto.join(' / ')).replace(SUJI, (m, n, t) => { set.add(hankaku(n) + t.replace('％', '%').replace('パーセント', '%')); return m; });
    // 単位ちがいで同じことを言っている分をならす
    const soe = [...set];
    soe.forEach(k => {
      const m = k.match(/^([\d.]+)(.+)$/); if (!m) return;
      if (m[2] === '万' ) set.add(String(Number(m[1]) * 10000) + '円');
      if (m[2] === '円' && Number(m[1]) % 10000 === 0) set.add(String(Number(m[1]) / 10000) + '万');
      if (m[2] === '分') set.add(String(Number(m[1]) * 60) + '秒');
      if (m[2] === '時間') set.add(String(Number(m[1]) * 60) + '分');
    });
    return set;
  }

  // 本文だけを見ます。見出しと、部下が付ける控えの行は数えません。
  function honbunGyou(text) {
    return text.split('\n').filter(l => {
      const s = l.trim();
      if (!s) return false;
      if (/^#{1,6}\s/.test(s)) return false;          // 見出し
      if (/^[-－]\s*(突いた痛み|使った数字|次の一歩|先に言ったできないこと)\s*[:：]/.test(s)) return false; // 控え
      if (/^```/.test(s)) return false;
      return true;
    });
  }

  function katamari(text) {
    // 「## 」で区切って、1本ずつにします
    const blocks = [];
    let now = null;
    text.split('\n').forEach(line => {
      if (/^##\s+/.test(line)) { if (now) blocks.push(now); now = { title: line.replace(/^##\s+/, '').trim(), lines: [] }; }
      else if (now) now.lines.push(line);
    });
    if (now) blocks.push(now);
    return blocks;
  }

  /**
   * text: 部下が出した文章 / karte: カルテ / yakuwari: 'shukyaku' | 'kyoiku' | 'hanbai'
   * かえるもの: { shikaru: [...], hito_ga_miru: [...], ok: [...] }
   *   shikaru     = 機械が「これは直す」と言える所
   *   hito_ga_miru = 機械では決められないので、人が目で見る所
   */
  function shiraberu(text, karte, yakuwari) {
    const shikaru = [];
    const hito = [];
    const ok = [];
    const honbun = seikika(honbunGyou(text).join('\n'));
    const kinshi = (karte.kinshi || []).concat(DANTEI);

    // 1. 使ってはいけない言葉
    const detaKinshi = [...new Set(kinshi.filter(w => honbun.includes(w)))];
    if (detaKinshi.length) detaKinshi.forEach(w => shikaru.push({ kind: '使ってはいけない言葉', detail: `「${w}」が出ています`, naze: 'カルテの kinshi か、言い切りの言葉です。言い過ぎになります' }));
    else ok.push('使ってはいけない言葉は出ていません');

    // 2. カルテに無い数字
    const yurusu = yurusuSuji(karte);
    const deta = new Set();
    honbun.replace(SUJI, (m, n, t) => { deta.add(hankaku(n) + t.replace('％', '%').replace('パーセント', '%')); return m; });
    const nai = [...deta].filter(k => !yurusu.has(k));
    if (nai.length) nai.forEach(k => shikaru.push({ kind: 'カルテに無い数字', detail: `「${k}」はカルテに出どころがありません`, naze: '出どころの無い数字は、書いた人が責任を取れません' }));
    else ok.push('出てきた数字はぜんぶカルテに出どころがあります');

    // 3. 呼び方のブレ
    const yougo = karte.yougo || {};
    (yougo['使わない呼び方'] || []).forEach(w => {
      if (honbun.includes(w)) shikaru.push({ kind: '呼び方のブレ', detail: `「${w}」が出ています`, naze: `カルテでは「${yougo['読者の呼び方'] || 'あなた'}」と決めています` });
    });
    (yougo['言い換えない言葉'] || []).forEach(w => {
      // その言葉が1回も出ていないなら、言い換えられた可能性を人に見てもらう
      if (!honbun.includes(w)) hito.push({ kind: '言い換えられたかも', detail: `「${w}」が1度も出ていません`, naze: '別の言い方にされていないか、目で見てください' });
    });

    // 4. 絵文字
    if (EMOJI.test(honbun)) shikaru.push({ kind: '絵文字', detail: '絵文字か装飾記号が入っています', naze: '書かせたことがすぐ分かります' });
    else ok.push('絵文字は入っていません');

    // 5. 次の一歩
    const tsugi = (karte.tsugi_no_ippo || {})[yakuwari];
    const blocks = katamari(text);
    const nashi = blocks.filter(b => !b.lines.join('\n').includes('次の一歩'));
    if (tsugi && nashi.length && yakuwari !== 'hanbai') {
      nashi.forEach(b => shikaru.push({ kind: '次の一歩が無い', detail: `「${b.title}」に次の一歩がありません`, naze: '読んだ人の行き先が無いと、読まれて終わります' }));
    } else if (tsugi) ok.push('どの本にも次の一歩が付いています');

    // 6. 長さ
    const joge = { shukyaku: 140, kyoiku: 250, hanbai: 600 }[yakuwari];
    blocks.forEach(b => {
      const h = honbunGyou(b.lines.join('\n')).join('').replace(/\s/g, '');
      if (joge && h.length > joge) shikaru.push({ kind: '長すぎる', detail: `「${b.title}」が${h.length}字（上限${joge}字）`, naze: '決めた長さを超えると、置く場所に入りません' });
    });

    // 7. 販売係だけ: 向かない人がぜんぶ書かれているか
    if (yakuwari === 'hanbai') {
      const nuke = (karte.muitenai || []).filter(m => {
        const kaku = m.replace(/[（(].*?[)）]/g, '').replace(/[。、]/g, '').slice(0, 8);
        return !text.includes(kaku);
      });
      if (nuke.length) nuke.forEach(m => shikaru.push({ kind: '向かない人が抜けた', detail: `「${m}」が書かれていません`, naze: '向かない人を隠すと、返金の話になります' }));
      else ok.push('向かない人がぜんぶ書かれています');
      const iwanai = (karte.dekinai || []).some(d => {
        const kaku = d.replace(/[（(].*?[)）]/g, '').replace(/[。、]/g, '').slice(0, 8);
        return text.includes(kaku);
      });
      if (!iwanai) shikaru.push({ kind: '言えないことが無い', detail: '買う前に知らせるべき「できないこと」が1つも書かれていません', naze: '買ってから聞いてない、が一番よくありません' });
      else ok.push('言えないことが先に書かれています');
    }

    // 8. ここは機械では決められません
    hito.push({ kind: '人が見る', detail: '痛みの引用が、カルテの言葉のままか（言い足していないか）', naze: '盛った痛みは、読んだ人に見抜かれます' });
    hito.push({ kind: '人が見る', detail: 'お客さんの声・事例のように読める文が混じっていないか', naze: '架空の声は景品表示法に当たります' });
    hito.push({ kind: '人が見る', detail: '効果を約束する言い方になっていないか（〜になりますの形）', naze: '測っていない結果は約束できません' });

    return { shikaru, hito_ga_miru: hito, ok, blocks: blocks.length };
  }

  return { shiraberu, yurusuSuji, seikika, DANTEI };
});
