/* eslint-env browser */
import { PolymerElement, html } from "@polymer/polymer";
import { mixinBehaviors } from '@polymer/polymer/lib/legacy/class.js';
import { IronResizableBehavior } from '@polymer/iron-resizable-behavior/iron-resizable-behavior.js';

/**
`poly-graph` is a live multi-timeseries graphing element

Key features:


* * Live animated timeseries graph
* * Supporting multiple 'pens' drawing lines or dots
* * Pens can have custom color, line width, name (TODO: render name)
* * New data points added with a timestamp or defaults to Date.now()

Wishlist (coming soon):

* * It should be possible to 'lift the pen' ~ pause
* * Adding limits/thresholds with labels
* * Pan (mouse or finger drag) and zoom (mouse scroll or pinch) on both live and static graphs
* * Pause/play timeline
* * Import data for static graph (e.g. post recording)

@demo demo/index.html
@polymerBehavior Polymer.IronResizableBehavior

*/

class PolyGraph extends mixinBehaviors([IronResizableBehavior], PolymerElement)
{
    constructor()
    {
        super();
        this.addEventListener('iron-resize', () => this._onIronResize() );
        this.addEventListener('zoom-changed', () => this._onZoomChanged() );
    }

    static get template()
    {
        return html`
        <style>
            :host {
                display: block;
                -webkit-user-select: none;
                -moz-user-select: none;
                user-select: none;
            }

            canvas {
                display: block;
            }
        </style>
        <canvas id="polygraph" width="[[_width]]" height="[[_height]]"></canvas>
        `;
    }

    static get is() { return 'poly-graph'; }

    static get properties()
    {
        return {
            pens: {
                type: Object,
                value: function() { return {}; },
            },
            guides: {
                type: Object,
                value: function() { return {}; },
            },
            _width: {
                type: Number,
                notify: true
            },
            _height: {
                type: Number,
                notify: true
            },
            min: {
                type: Number,
                value: -1
            },
            max: {
                type: Number,
                value: 1
            },
            topmargin: {
                type: Number,
                value: 8
            },
            bottommargin: {
                type: Number,
                value: 8
            },
            running: {
                type: Boolean,
                value: true
            },

            /**
            * Pixels per second (x-axis resolution)
            */
            resolution: {
                type: Number,
                value: 50
            }
        };
    }

    connectedCallback()
    {
        super.connectedCallback();

        // TODO: proper pan/zoom  detect...
        // this.$.polygraph.addEventListener('mousedown', function(e) {
        //   console.log('[mousedown]', e);
        //   mdown = true;
        // }, true);

        // this.$.polygraph.addEventListener('mouseup', function(e) {
        //   console.log('[mouseup]', e);
        //   mdown = false;
        // }, true);

        // this.$.polygraph.addEventListener('mousemove', function(e) {
        //   //if(mdown)console.log('[mousedrag]', e);
        // },true);

        // document.addEventListener('mouseup', function(e) {
        //   console.log('[mouseup (shadow)]', e);
        //   mdown = false;
        // });

        this.async(this.notifyResize, 1);
        this._gameLoop();
    }

    addPen(id, options)
    {
        if(this.pens[id])
        {
            console.log("Pen already added: ", id);
        }

        this.pens[id] = {
            color:options.color ? options.color : '#000',
            name:options.name ? options.name : "",
            line:!options.dotsOnly,
            lineWidth:options.lineWidth ? options.lineWidth : 1,
            data:[]
        };
    }

    addGuide(id, options)
    {
        if(this.guides[id])
        {
            console.log("Guide already added: ", id);
            return;
        }

        if(!options || options.min === undefined)
        {
            console.log("Guide needs at least a 'min' value defined");
            return;
        }

        this.guides[id] = {
            color:options.color ? options.color : '#888',
            name:options.name ? options.name : "",
            min:options.min,
            height:options.height
        };
    }

    addValue(id, value, timestamp)
    {
        const pen = this.pens[id];
        if(!pen)
            return;

        if(!timestamp) timestamp = Date.now(); // Maybe: performance.timing.navigationStart + performance.now();

        // time must go forward
        if(pen.data.length > 0 && pen.data[pen.data.length-1].t >= timestamp)
            return;

        pen.data.push({v:value, t:timestamp});
    }

    _onIronResize()
    {
        if(this.offsetWidth == this._width && this.offsetHeight == this._height)
            return;

        // TBD:  resize shouldn't happen too often - maybe debounce is overkill to prevent too much flickering, etc.
        this.debounce('resizeDebounce', function() {
            console.log(this.offsetWidth, this.offsetHeight);

            this.$.polygraph.width = this.offsetWidth;
            this.$.polygraph.height = this.offsetHeight;

            this._recalcFactors();
        }.bind(this), 100);
    }

    _onZoomChanged()
    {
        this._pixelsPerSecond = 100 * this.zoom;
    }

    _recalcFactors()
    {
        this._ya = -(this.$.polygraph.height - this.bottommargin - this.topmargin) / (this.max - this.min);
        this._yb = this.topmargin - this._ya * this.max;
    }

    _calcY(val)
    {
        return this._ya * val + this._yb;
    }

    _calcPos(point, pos, now)
    {
        pos.x =  this.$.polygraph.width - 5 - (now - point.t) * 0.001 * this.resolution;
        pos.y = this._ya * point.v + this._yb;
    }

    _gameLoop()
    {
        if(this.offsetWidth == this._width && this.offsetHeight == this._height)
        {
            this._repaint(Date.now()); // Maybe: performance.timing.navigationStart + ts
        }
        else
        {
            this._width = this.offsetWidth;
            this._height = this.offsetHeight;
            this._onIronResize();
        }

        if(this.running)
        {
            requestAnimationFrame(this._gameLoop.bind(this));
        }
    }

    _repaint(now)
    {
        const canvas = this.$.polygraph;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0,0,canvas.width, canvas.height);

        let id, pen, guide, ptr, pos = {}, dots = [];

        // Draw guides
        for(id in this.guides)
        {
            guide = this.guides[id];
            if(guide.height !== undefined)
            {
                ctx.fillStyle = guide.color;
                ctx.fillRect(0,this._calcY(guide.min),canvas.width,this._ya * guide.height);
            }
            else
            {
                ctx.beginPath();
                ctx.strokeStyle = guide.color;
                ctx.moveTo(0, this._calcY(guide.min));
                ctx.lineTo(canvas.width, this._calcY(guide.min));
                ctx.stroke();
            }
        }

        // Draw pens
        for(id in this.pens)
        {
            pen = this.pens[id];
            if(pen.data && pen.data.length > 1)
            {
                ctx.beginPath();
                ctx.lineWidth = pen.lineWidth;
                ptr = pen.data.length-1;
                this._calcPos(pen.data[ptr], pos, now);
                if(pen.line)
                {
                    ctx.strokeStyle = pen.color;
                    ctx.moveTo(pos.x, pos.y);
                    // if(now - pos.t < 100) {
                    dots.push({x:canvas.width-5,y:pos.y,color:pen.color});
                    // }
                }
                else
                {
                    ctx.fillStyle = pen.color;
                }

                while(ptr >= 0 && pos.x > 0)
                {
                    this._calcPos(pen.data[ptr], pos, now);
                    if(pen.line)
                    {
                        ctx.lineTo(pos.x, pos.y);
                    }
                    else
                    {
                        ctx.beginPath();
                        ctx.arc(pos.x,pos.y,4,0,Math.PI*2,false);
                        ctx.fill();
                    }
                    ptr--;
                }
                if(pen.line)
                {
                    ctx.stroke();
                }
            }
        }

        ctx.lineWidth = 1.0;

        dots.forEach(function(dot) {
            ctx.beginPath();
            ctx.arc(dot.x,dot.y,4,0,Math.PI*2,false);
            ctx.fillStyle = dot.color;
            ctx.fill();
        });
    }
}

window.customElements.define(PolyGraph.is, PolyGraph);
