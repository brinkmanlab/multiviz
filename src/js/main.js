import './assign-globals'
import '../bootstrap/js/bootstrap.min'
import Papa from 'papaparse';
import MultiVis from './genomecomparevis'
import Newick from './newick'

$(document).ready(function() {
    const query = new URLSearchParams(location.search);
    const dataset_id = query.get('dataset_id');
    let injected_data = document.getElementById('injected_data').textContent;
    if (/^\s+$/.test(injected_data)) injected_data = false;

    // Allow specifying full src path in query or fall back to galaxy dataset path
    const src = (injected_data && atob(injected_data)) || query.get('src') || (dataset_id && `/datasets/${dataset_id}/display`);

    if (!injected_data && query.has('src')) {
        // Papaparse fails CORS, check preflight and compensate
        fetch(query.get('src'), {
            method: 'OPTIONS',
        }).then(response=>{
            if (response.ok) {
                loadVis(src);
            } else {
                // Do 'simple' CORS request and pass result to papaparse
                fetch(src).then(response=>response.blob().then(loadVis));
            }
        }).catch(reason => {
            fetch(src).then(response=>response.blob().then(loadVis));
        })
    } else {
        if (src) loadVis(src);
        else {
            $("#loading").hide();
            $("#upload_box").show().on('change', function(event){
                loadVis((event.dataTransfer ? event.dataTransfer.files : event.target.files)[0]);
                $("#upload_box").hide();
            });
        }
    }
});

function loadVis(src) {
    var container = new MultiVis("#visualization-body");

    var treeOrder;

    var parser = Papa.parse(src, {
        download: typeof src == 'string',
        delimiter: "\t",
        worker: false,
        skipEmptyLines: true,
        beforeFirstChunk: function (chunk) {
            // Add the newick data to generate a tree
            let nwk = chunk.match(/^##newick: ([^\n]+)/m);
            if (nwk && nwk.length > 1) {
                container.newickData = Newick.parse(nwk[1]);
            } else {
                console.log("No newick found in first chunk.", chunk);
            }
            // Set the root of the tree
            container.newickRoot = container.newickData;
            //var reg = /^##sequence-region ([^ ]+) [^ ]+ ([^ \n]+)/mg;
            //var seq;
            //while (seq = reg.exec(chunk)) {
            //    container.backbone.addSequence(seq[1], Number(seq[2]), seq[1], seq[1]);
            //}

            // Traverse tree to find sequence id order
            treeOrder = container.traverseTreeForOrder(container.newickRoot);

            return chunk.replace(/^#.*\n/mg, '');
        },
        step: function (results, parser) {
            const row = results.data;
            row[3] = Number(row[3]);
            row[4] = Number(row[4]);
            let sequence = null;
            switch (row[2]) {
                case 'sequence':
                    let shownName = /userid=([^;\n]+)/.exec(row[8]); // The user provided identifier (file name)
                    shownName = shownName ? shownName[1] : row[0];
                    let seqname = /Name=([^;\n]+)/.exec(row[8]);
                    seqname = seqname ? seqname[1] : row[0];
                    sequence = container.backbone.getSequences().find(seq => seq.sequenceId === row[0]);
                    if (!sequence) {
                        container.backbone.addSequence(row[0], row[4], seqname, shownName);
                    } else {
                        sequence.name = seqname;
                        sequence.shownName = shownName;
                        sequence.sequenceSize = row[4];
                    }
                    break;
                case 'genomic_island':
                    //Add GI
                    var program;
                    switch (row[1]) {
                        case 'Colombo/SigiHMM':
                            program = 'sigi';
                            break;
                        case 'islandpath':
                            program = 'islandpath';
                            break;
                        case 'blast':
                            program = 'blast';
                            break;
                        case 'curated':
                            program = 'curated';
                            break;
                        default:
                            program = 'merged';
                            break;
                    }
                    let cluster = /cluster=([^;\n]+)/.exec(row[8]);
                    cluster = cluster ? cluster[1] : null;
                    let color = /color=([^;\n]+)/.exec(row[8]);
                    color = color ? color[1] : null;
                    let parent = /Parent=([^;\n]+)/.exec(row[8]);
                    parent = parent ? parent[1] : null;
                    let query = /Query=([^|;\n]+)/.exec(row[8]);
                    query = query ? query[1] : null;
                    sequence = container.backbone.getSequences().find(function (seq) {
                        return seq.sequenceId === row[0];
                    });
                    if (!sequence) sequence = container.backbone.addSequence(row[0]);
                    sequence.addGI(program, {
                        start: row[3],
                        end: row[4],
                        cluster: cluster,
                        color: color,
                        parent: parent,
                        query: query,
                    });
                    break;
                case 'match':
                    //Add alignment
                    let target = /Target=([^ ]+) ([^ ]+) ([^ ;\n]+)(?: ([\+\-\.]))?/.exec(row[8]);
                    target[2] = Number(target[2]);
                    target[3] = Number(target[3]);
                    let dist = treeOrder.indexOf(target[1]) - treeOrder.indexOf(row[0]);
                    if (dist === 1 || dist === -1) {
                        if (row[6] === "-") {
                            row[3] *= -1;
                            row[4] *= -1;
                        }
                        if (target[4] === "-") {
                            target[2] *= -1;
                            target[3] *= -1;
                        }
                        if (dist > 0)
                            container.backbone.addHomologousRegion(row[0], row[3], row[4], target[2], target[3]);
                        else
                            container.backbone.addHomologousRegion(target[1], target[2], target[3], row[3], row[4]);
                    }
                    break;
                case 'gene':
                    if (row[1] === "RGI-CARD") {
                        //Add AMR
                        sequence = container.backbone.getSequences().find(seq => seq.sequenceId === row[0]);
                        if (!sequence) sequence = container.backbone.addSequence(row[0]);
                        sequence.addAMR([{start: row[3], end: row[4], strand: row[6]}]);
                    }
                    break;
                case 'CDS':
                case 'tRNA':
                case 'rRNA':
                    //Add gene
                    var name = /gene=([^;\n]+)/.exec(row[8]);
                    name = name ? name[1] : "";
                    //var gene_type = /Type=([^;\n]+)/.exec(row[8]);
                    var gene_type = row[2]; //gene_type ? gene_type[1] : "";
                    var locus_tag = /locus_tag=([^;\n]+)/.exec(row[8]);
                    locus_tag = locus_tag ? locus_tag[1] : "";
                    var product = /product=([^;\n]+)/.exec(row[8]);
                    product = product ? product[1] : "";
                    sequence = container.backbone.getSequences().find(seq => seq.sequenceId === row[0]);
                    if (!sequence) sequence = container.backbone.addSequence(row[0]);
                    sequence.addGene({
                        start: row[3],
                        end: row[4],
                        strand: row[6],
                        gene: name,
                        locus_tag: locus_tag,
                        product: product,
                        type: gene_type
                    });
                    break;
            }
        },
        complete: function () {
            container.sequenceOrder = container.backbone.getIndicesFromIds(treeOrder);
            // at this scale, individual scaling for sequences may not be usable...so used fixed scale
            for (const currentSeq of container.backbone.getSequences())
                currentSeq.updateScale(0, container.getLargestSequenceSize(), container.getLargestSequenceSize());

            $("#loading").hide();

            // render the graph
            container.render();
            // Hook resize event to redraw
            //this.container.on('resize', function(){
            //    self.transition();
            //});
            $(window).on('resize', function () {
                container.resetAndRenderRange();
            });
        }
    });

    var isPrinterColors = false;

    // Add listeners to button controls
    $(document).ready(function () {
        //Button resets any tree zooming that was done
        $("#resetTree").on("click", this, function () {
            container.resetAndRenderGraph();
        });
        //Button resets the range of the linear plot to (0,maxSize)
        $("#resetRange").on("click", this, function () {
            container.resetAndRenderRange();
        });
        //Button toggles if show true branch lengths or not
        $("#toggleBranchLength").on("click", this, function () {
            container.toggleTrueBranchLengths();
            container.transition();
        });
        //Button toggles printer colors on the linear plot
        $("#printerColors").on("click", this, function () {
            container.togglePrinterColors();
            container.render();
            // Update the Legend Colors
            isPrinterColors = !isPrinterColors;
            if (isPrinterColors) {
                $("#genomicIslandLegend").attr("class", "#genomicIslandsLegend print");
                $("#genesLegend").attr("class", "#genesLegend print");
                $("#tRNALegend").attr("class", "#tRNALegend print");
                $("#rRNALegend").attr("class", "#rRNALegend print");
                $("#genomeLegend").attr("class", "#genomeLegend print");
                $("#amrLegend").attr("class", "#amrLegend print");
            } else {
                $("#genomicIslandLegend").attr("class", "#genomicIslandsLegend");
                $("#genesLegend").attr("class", "#genesLegend");
                $("#tRNALegend").attr("class", "#tRNALegend");
                $("#rRNALegend").attr("class", "#rRNALegend");
                $("#genomeLegend").attr("class", "#genomeLegend");
                $("#amrLegend").attr("class", "#amrLegend");
            }
        });
        $("#toggleIdentifiers").on("click", this, function () {
            container.shownName = !container.shownName;
            container.render();
        });
        $("#saveSvg").on("click", this, function () {
            container.saveImage("svg");
        });
        $("#savePng").on("click", this, function () {
            container.saveImage("png");
        });
        $("#saveGff").on("click", this, function () {
            try {
                saveAs(src, "Analysis.gff3"); // Fails on newer browsers, waiting for fix
                // TODO download injected data
            } catch (e) {
                const link = document.createElement("a");
                link.setAttribute("href", src);
                link.setAttribute("type", "application/octet-stream");
                link.setAttribute("target", "_blank");
                link.setAttribute("download", "Analysis.gff3");
                link.click();
            }
        });
        $("#resetGIs").on("click", this, function () {
            container.toggleClusterView(container.cluster, null);
        });
        $("#zoomCluster").on("click", this, function () {
            container.zoomCluster();
        });
        // Changes to sigi/islandpath checkboxes will hide/show corresponding GIs
        $(".GIColourBody :checkbox").change(container.predictorToggle);
        // Changes to GI colour method will hide/show the merged GI set and enable/disable the predictor checkboxes
        $("input[name=GIColour]").change(container.GIColourToggle);
        // Set all buttons to have the same width
        var buttons = $("#btn-div").children();
        //buttons.width(buttons.width());
    });
}
