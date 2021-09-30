// Learn TypeScript:
//  - https://docs.cocos.com/creator/manual/en/scripting/typescript.html
// Learn Attribute:
//  - https://docs.cocos.com/creator/manual/en/scripting/reference/attributes.html
// Learn life-cycle callbacks:
//  - https://docs.cocos.com/creator/manual/en/scripting/life-cycle-callbacks.html

const { ccclass, property } = cc._decorator;

@ccclass
export default class main extends cc.Component {

    @property(cc.Node)
    viewContent: cc.Node = null; // 列表挂点

    @property(cc.Node)
    maskNode: cc.Node = null; // 遮罩

    @property(cc.ScrollView)
    scroll: cc.ScrollView = null; // 

    itemPrefab = null; // 预制体
    private startPos = null;// 滑动视图的起始位置
    private cachePool = [];// 移除的等待使用的item池
    private dataList = [];// 数据列表
    private maxNum = 8;// 必须小于服务器返回的每页最大个数，这里每页是20个
    private itemHeight = 105; // 高度+间隙
    private initY = 0;
    private maxY = 0;
    private minY = 0;
    private needSize = 0;//需求要求的高度/宽度
    private visibleHeight = 0;//显示范围高度
    private curOffset = 0;// 滑动偏移 距离左上角
    private miniIdx = 0;// 开始的数据列表index
    private showItemList = [];// 显示的item列表

    private headList = [];// 头像图列表
    async onLoad() {
        this.startPos = cc.v2(this.viewContent.position.x, this.viewContent.position.y);

        this.visibleHeight = this.maskNode.getContentSize().height;
        this.scroll.node.on("scrolling", this.onScrolling.bind(this), this);
        // 加载预制体和图片
        await new Promise((resolve, reject) => {
            cc.resources.loadDir("imgge", cc.SpriteFrame, (err, asset) => {
                if (!err) this.headList = asset;
                resolve(asset);
            })
        })
        await new Promise((resolve, reject) => {
            cc.resources.load("prefab/item", cc.Prefab, (err, asset) => {
                if (!err) this.itemPrefab = asset;
                resolve(asset);
            })
        })
        // 可以请求服务器得到
        // 总共40个数据
        for (let i = 0; i < 40; i++) {
            this.dataList.push(i + 1);
        }
        this.loadList();
    }
    // 每次显示 都初始化一下，用于重新加载数据,滑动重置
    onEnable() {
        this.cachePool = [];
        this.dataList = [];
        this.viewContent.height = 0;
        this.initY = -this.itemHeight / 2;
        this.curOffset = 0;
        this.miniIdx = 0;
        this.showItemList = []

        if (this.startPos) this.viewContent.position = this.startPos; // 重置初始位置
    }
    start() {
    }

    // 加载列表
    loadList() {
        this.viewContent.destroyAllChildren();// 只要是第一页就重新加载；
        this.InitObjs();
        // 设置内容高度
        this.needSize = this.dataList.length * this.itemHeight;
        this.viewContent.setContentSize(new cc.Size(this.viewContent.getContentSize().width, this.needSize));
    }
    // 初始化几个
    InitObjs() {
        let curX = 0;
        let curY = 0;
        for (let i = 0; i < this.maxNum; i++) {
            if (!this.dataList[i]) break;
            let obj = cc.instantiate(this.itemPrefab);
            obj.parent = this.viewContent;
            obj.active = true;
            curY = this.initY - this.itemHeight * i;
            obj.position = cc.v3(curX,curY);
            this.onRefresh(obj,i+"", i);
            this.showItemList.push(obj);
        }
    }
    //计算边界，超过边界则刷新列表
    //offest是左上角原点滑动的偏移量
    private countBorder(offest) {
        let height = this.visibleHeight;//可见高度
        this.minY = offest;//获得相对于左上角原点的最小y值
        this.maxY = offest + height;//获得相对于左上角原点的最大y值
    }
    //强行刷新
    public refresh() {
        let offest = this.curOffset;

        //最大高度，超过该高度，不刷新
        let maxY = this.needSize;
        if (offest < 0 || offest + this.visibleHeight >= maxY)
            return;

        let idx: number = 0;//从0开始
        this.countBorder(offest);
        let lastMinIdx = this.miniIdx;
        let miniIdx = Math.floor(offest / this.itemHeight);
        // 当每次更新miniIdx 不同的时候，就是移除和新建的时候
        if (this.miniIdx != miniIdx) {
            let curY = this.initY - this.itemHeight * miniIdx;// 当前要开始的y,大于y的删除
            let curEndY = this.initY - this.itemHeight * (miniIdx + this.maxNum);// 当前要结束的y,小于y的删除
            let deleteNodeUuIdList = [];// 需要移除的uuid 
            let remainList = [];// 剩余的data index
            this.showItemList.forEach((item, index) => {
                if (item.position.y > curY || item.position.y <= curEndY) {// 大于当前展示的坐标或者小于当前展示的最小坐标，就可以移除
                    deleteNodeUuIdList.push(item.uuid);
                }
                else {
                    remainList.push(lastMinIdx + index); // 这里的顺序 iten列表对应上次实例化的data的index
                }
            })
            let len = this.showItemList.length;
            for (let index = len - 1; index >= 0; index--)// 逆序移除 防止移除多个问题
            {
                let item = this.showItemList[index];
                if (deleteNodeUuIdList.indexOf(item.uuid) >= 0)// 在删除列表里，就删除，加到缓存列表中
                {
                    this.cachePool.push(item);
                    this.showItemList.splice(index, 1);
                }
            }
            this.miniIdx = miniIdx; // 更新
            for (let i = 0; i < this.maxNum; i++) {
                idx = this.miniIdx + i;
                if (remainList.indexOf(idx) < 0)// 没有包含的 新实例化的数据，在剩余item中没有的就创建
                {
                    this.refreshItem(idx, i);
                }
            }
        }
    }

    //idx是UI该刷新的第几个元素
    private refreshItem(idx, objIdx) {
        if (idx < 0 || idx >= this.dataList.length)
            return;
        let obj = this.cachePool.pop();
        if (obj == null) {
            console.error("obj is null！");
            return;
        }

        let curX = 0;
        let curY = 0;
        curY = this.initY - this.itemHeight * idx;

        // console.error("idx:" + idx + ",curX:" + curX + ",curY:" + curY);
        obj.position = cc.v3(curX, curY);
        obj.active = true;
        this.onRefresh(obj, objIdx, idx);

        this.showItemList.push(obj);
        // 这里坐标按照显示从上到下  从大到小的排序 ，因为this.showItemList的都是后面push ,实例化下面数据，可以push，但是实例化上面数据，需要加到最前面，按照位置，
        // 否则删除的时候根据index  remainList是根据index+lastMinIdx保留的，也就是数据列表的index,实例化上面数据index push到最后，到时候remian中index和实际的数据index不对应
        this.showItemList.sort((a, b) => {
            return -a.position.y + b.position.y;
        })
    }

    /**
     * 刷新回调
     * @param obj 
     * @param idx 需求显示的索引
     * @param objIdx 实际的item索引
     */
    private onRefresh(obj, idx: string, objIdx) {
        let head = obj.getChildByName("head").getComponent(cc.Sprite);
        let num = obj.getChildByName("num").getComponent(cc.Label);
        head.spriteFrame = this.headList[objIdx];
        num.string = this.dataList[objIdx];
    }

    // 滑动中
    onScrolling() {
        //获取滚动视图相对于左上角原点的当前滚动偏移
        let scrollOffset: cc.Vec2 = this.scroll.getScrollOffset();
        this.curOffset = scrollOffset.y;
        this.refresh();
    }
    update(dt) {
    }
}
