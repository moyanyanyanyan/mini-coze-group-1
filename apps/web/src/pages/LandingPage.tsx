// 首屏
import styles from './LandingPage.module.css';
import { useNavigate } from 'react-router';

const features = [
  { icon: "💬", name: "智能对话", desc: "直接和智能体聊天，把你的想法说给它听" },
  { icon: "🤖", name: "Agent 搭建", desc: "创建专属智能体，定义它的性格与能力" },
  { icon: "📚", name: "知识库", desc: "上传文档，让它读过你读过的东西" },
  { icon: "🧩", name: "工作流", desc: "把步骤拖成一条线，AI 自己跑完整个流程" },
  { icon: "🔌", name: "插件工具", desc: "给 AI 装上工具，扩展它的能力边界" },
  { icon: "🔑", name: "API / SDK", desc: "拿到 API Key，把智能体接进你自己的应用" },
];

export function LandingPage(){
    const navigate=useNavigate();
    return (
        <div className={styles.landing}>
            <header className={styles.navBar}>
                <span className={styles.logo}>MiniCoze</span>
                <div className={styles.navActions}>
                    <button className={styles.btnGhost} onClick={()=>navigate("/login")}>登录</button>
                    <button className={styles.btnPrimary} onClick={()=>navigate("/register")}>开始使用</button>
                </div>
            </header>

            {/* 首屏主视觉 Hero 区 */}
            <section className={styles.hero}>
                <h1 className={styles.heroTitle}>把想法，搭成能跑的智能体</h1>
                <p className={styles.heroSubtitle}>
                    喂给它资料、装上工具、把它拖成一条线——不写代码，你的 AI 助手就能上班。
                </p>
                <div className={styles.heroActions}>
                    <button className={styles.btnPrimary} onClick={()=>navigate("/app")}>
                        动手搭一个<span className={styles.btnArrow}>→</span>
                    </button>
                </div>
                <div className={styles.scrollHint}>↓ 往下看看，它能替你干嘛</div>
            </section>
            {/* 核心功能展示区 */}
            <section className={styles.features}>
                <div>
                    <h2 className={styles.featuresEyebrow}>核心能力介绍</h2>
                    <p className={styles.featuresSubtitle}>
                        从一句想法到上线发布,六个模块覆盖智能体的全部功能
                    </p>
                </div>
                <div className={styles.featuresGrid}>
                    {features.map((f)=>(
                        <div key={f.name} className={styles.featureCard}>
                            <div className={styles.featureIcon}>{f.icon}</div>
                            <div className={styles.featureName}>{f.name}</div>
                            <div className={styles.featureDesc}>{f.desc}</div>
                        </div>
                        ))
                    }
                </div>
            </section>
            <section className={styles.ctal}>
                <button className={styles.btnPrimary} onClick={()=>navigate("/app")}>尝试我们的产品</button>
            </section>
        </div>
    );
}
