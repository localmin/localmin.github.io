---
title: "Starshipの導入 "
createdAt: 2020-05-17
public: true
layout: ../../layouts/BlogPost.astro
slug: example
---
https://starship.rs/ (公式)
https://starship.rs/ja-JP/ (日本語公式)

プロンプトをいい感じにしてくれるやつ。

普段プロンプトをカスタマイズすることはあんまりないんだが、ちょっとお洒落だしrust製だったのでお試しで使ってみた。
公式ドキュメントも日本語訳があったからもしかして結構普及しているのかな。まあところどころ怪しい日本語があったけど。

以下自分の設定
```toml
# Disable the newline at the start of the prompt
add_newline = false

[character]      
symbol = "( ╹◡╹)"     
style_success = "green"
style_failure= "red"

[battery]
full_symbol = "🔋"
charging_symbol = "⚡️"
discharging_symbol = "💀"

[[battery.display]]  
threshold = 10
style = "bold red"

[[battery.display]]  
threshold = 30
style = "bold yellow"

[directory]
truncation_length = 20
style = "172"

[git_status]
conflicted = "💀"
conflicted_count.enabled = true
conflicted_count.style = "green"
ahead = "🏎💨"
behind = "😰"
diverged = "😵"
untracked = "🤷‍"
untracked_count.enabled = true
untracked_count.style = "green"
stashed = "📦"
modified = "📝"
modified_count.enabled = true
modified_count.style = "green"
staged.value = "+"
staged.style = "green"
staged_count.enabled = true
staged_count.style = "green"
renamed = "👅"
deleted = "🗑"

[docker_context]
disabled = true
```
割と公式準拠な内容のはず。強いて言えばgit_statusのcountところはちょっと手を加えた。これで開発でgit叩いてるときに幸せになれるのかもしれない(うまく行ってないときは苛つきそうな気もする…

フォントは公式だと[FIraCode](https://github.com/tonsky/FiraCode)推奨だったけど、もともと設定していたMonacoでも問題なさそう。

一個だけ不満点があってpythonのversion表示が2~で表示されている。brewでのデフォルトが現時点では2系なので普段はaliasで`python `を叩くと3系が呼び出されるようにしてるが
Starfishだと2系が表示されてしまうの回避する方法はぱっと思いつかなかった。githubのissueを探れば何かありそうだけど、そこまでモチベはなくて今のところ未確認。今日は店じまいってことであとで追記するかも。

公式のデモを見るとfish使い向けに見えるが今のところ問題なし。
まあ今のところのgitのstatus表示がお洒落になったくらいしかメリットを感じないんだけど、とりあえずはこのままでいく。デメリットもないので。
