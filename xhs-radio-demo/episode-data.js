/*
 * FakeRadio 离线 Demo · 节目数据
 * ------------------------------------------------------------------
 * 小红书沙箱禁用 fetch/XHR,无法读取 .json,所以节目数据以纯数据字面量
 * 形式挂到全局 window.__EPISODE__ 上,由 app.js 读取。
 *
 * 本期:温柔摇滚 —— The Beatles / Queen / Pink Floyd / David Gilmour / David Bowie
 * 每段 mp3 = DJ 口播(TTS 配音) + 歌曲,已混音好(音乐在口播中段以低音量垫入,尾段升起)。
 * 注:story 是屏幕显示文稿,年份用阿拉伯数字;音频里的年份读音已在配音阶段用中文数字生成,
 *    两者刻意解耦——显示好看、读音正确,互不影响。
 *
 * 换期只需替换本文件 tracks 与 assets/audio/*.mp3(详见 README)。
 */
window.__EPISODE__ = {
  station: "FakeRadio · 88.7 FM",
  title: "温柔摇滚",
  date: "2026-07-15",
  logo: "./assets/img/logo.jpg",
  dj: { name: "AI HOST", avatar: "./assets/img/dj.jpg" },
  tracks: [
    {
      no: 1,
      title: "Here Comes the Sun",
      artist: "The Beatles",
      file: "./assets/audio/track-1.mp3",
      duration: 190,
      story: "1969年初春，George Harrison 逃出一场没完没了的商务会议，带着吉他躲进 Eric Clapton 家的花园。就在晒太阳的那几分钟里，这首《Here Comes the Sun》的旋律自己冒了出来。那个冬天对整支乐队都格外漫长——而这首歌，是他写给春天的第一缕光。"
    },
    {
      no: 2,
      title: "Love of My Life",
      artist: "Queen",
      file: "./assets/audio/track-2.mp3",
      duration: 221,
      story: "Freddie Mercury 把这首《Love of My Life》写给了 Mary Austin——他一生挚爱，也是他把伦敦故居留给的那个人。录音时他亲自弹了竖琴，前奏里那种小心翼翼，像是怕碰碎什么。很多年后的现场，整座球场会替他唱完每一句，他只需要把话筒交给人群。"
    },
    {
      no: 3,
      title: "Wish You Were Here",
      artist: "Pink Floyd",
      file: "./assets/audio/track-3.mp3",
      duration: 339,
      story: "1975年，Pink Floyd 正在录这首《Wish You Were Here》，录音棚里进来一个剃光了头、连眉毛都刮掉的胖子，没人认得出。直到有人反应过来——那是他们当年因迷幻药离队的创始人 Syd Barrett。这首歌，正是写给他的。两个迷失的灵魂，在同一个鱼缸里，年复一年地游。"
    },
    {
      no: 4,
      title: "On an Island",
      artist: "David Gilmour",
      file: "./assets/audio/track-4.mp3",
      duration: 411,
      story: "离开 Pink Floyd 的喧嚣，David Gilmour 一个人待在希腊的一座小岛上，写下了这首《On an Island》。没有宏大的概念，也不用向谁证明什么，只有海、光，和一把不急不缓铺开的吉他。他说，这是六十岁那年，他送给自己的一片安静。"
    },
    {
      no: 5,
      title: "Space Oddity",
      artist: "David Bowie",
      file: "./assets/audio/track-5.mp3",
      duration: 322,
      story: "1969年，就在阿波罗登月前几天，David Bowie 放出了这首《Space Oddity》。他造了一个叫 Major Tom 的宇航员，飞出地球，切断了和地面的联系，飘向无边的黑暗。BBC 一边拿它给登月画面配乐，一边其实没敢细想歌里的结局。这里是汤姆少校呼叫地面——我正飘在一个铁罐子里，远远高过这个世界。"
    }
  ]
};
