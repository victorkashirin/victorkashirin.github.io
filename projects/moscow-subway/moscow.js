(function () {
    d3.queue()
        .defer(d3.csv, 'dataset/stations.csv')
        .defer(d3.csv, 'dataset/transfers.csv')
        .defer(d3.csv, 'dataset/updates.csv')
        .defer(d3.json, 'dataset/lines.json')
        .await(makeChart);

    function makeChart(error, stationsData, transfersData, updatesData, processedLines) {
        var sharedNames = ['Kiyevskaya', 'Taganskaya', 'Tretyakovskaya',
            'Kuntsevskaya', 'Kutuzovskaya', 'Timiryazevskaya',
            'Park Kultury', 'Avtozavodskaya', 'Kitay-gorod',
            'Prospekt Mira', 'Bulvar Rokossovskogo',
            'Kurskaya', 'Komsomolskaya', 'Paveletskaya',
            'Belorusskaya', 'Oktyabrskaya', 'Vladykino',
            'Petrovsko-Razumovskaya', 'Botanichesky Sad',
            'Shosse Entuziastov', 'Park Pobedy', 'Kashirskaya', 'Dubrovka'];

        var lineInfo = {
            '1': ['#ED1B35', 'Сокольническая'],
            '2': ['#44B85C', 'Замоскворецкая'],
            '3': ['#0078BF', 'Арбатско-Покровская'],
            '4': ['#19C1F3', 'Филёвская'],
            '5': ['#894E35', 'Кольцевая'],
            '6': ['#F58631', 'Калужско-Рижская'],
            '7': ['#B232B2', 'Таганско-Краснопресненская'],
            '8': ['#FFCB31', 'Калининско-Солнцевская'],
            '8A': ['#FFCB31', 'Калининско-Солнцевская'],
            '9': ['#A1A2A3', 'Серпуховско-Тимирязевская'],
            '10': ['#B3D445', 'Люблинско-Дмитровская'],
            '11A': ['#79CDCD', 'Каховская'],
            '12': ['#ACBFE1', 'Бутовская'],
            '13': ['#2C75C4', 'Монорельс'],
            '14': ['#EE2722', 'Московское центральное кольцо'],
            'transfer': ['#CCC'],
            'invisible': ['#ffffff']
        };

        var visualConfig = {
            linkOpacity: 0.9,
            tolerance: 0.4,
            showLabels: true,
            globalEm: '0.7em',
            controlsTopMargin: 30,
            controlsLeftMargin: 30,
            layout: (window.innerWidth > window.innerHeight) ? 'landscape' : 'portrait',
            mobile: Math.max(window.innerWidth, window.innerHeight) < 768
        };

        var dateParse = d3.timeParse('%Y-%m-%d');
        var dateToString = function (date) {
            var monthToString = {
                0: 'Январь',
                1: 'Февраль',
                2: 'Март',
                3: 'Апрель',
                4: 'Май',
                5: 'Июнь',
                6: 'Июль',
                7: 'Август',
                8: 'Сентябрь',
                9: 'Октябрь',
                10: 'Ноябрь',
                11: 'Декабрь'
            };
            return [monthToString[date.getMonth()], date.getFullYear() + ' г.']
        };

        function getMapSettings() {
            var settings = {
                zoom: 11,
                mapCenter: [55.71802, 37.609161],
                leafletZoom: {
                    minZoom: 10,
                    maxZoom: 16
                }
            };

            if (window.innerHeight < 900) {
                settings.leafletZoom = {
                    minZoom: 9,
                    maxZoom: 16
                };
                settings.zoom = 10;
            }
            return settings;
        }

        var map;
        var mapSettings = getMapSettings();
        updatesData.forEach(function (d) {
            d.from = d3.timeMonth.floor(dateParse(d.from));
            d.to = d3.timeMonth.floor(dateParse(d.to));
        });

        stationsData.forEach(function (d) {
            d.LatLng = new L.LatLng(d.lat, d.lon);
            d.date = d3.timeMonth.floor(dateParse(d.opened));
            d.prev = null;
            d.next = null;
            d.invert_label = !!+d.invert_label;
            d.updates = _.filter(updatesData, {'name_en': d.name_en, 'opened': d.opened});
        });

        function findStation(name_en, opened) {
            return _.find(stationsData, function (d) {
                return d.name_en === name_en && d.opened === opened
            })
        }

        function compareDates(d1, d2) {
            // we don't use timestamps because we want to check months
            if (d1.getYear() < d2.getYear()) return 1;
            if (d1.getYear() === d2.getYear() && d1.getMonth() < d2.getMonth()) return 1;
            if (d1.getYear() === d2.getYear() && d1.getMonth() === d2.getMonth()) return 0;
            if (d1.getYear() === d2.getYear() && d1.getMonth() > d2.getMonth()) return -1;
            if (d1.getYear() > d2.getYear()) return -1;
        }

        function neighborCheck(d, currentDate) {
            var prevExists = !!(d.prev && compareDates(d.prev.date, currentDate) > -1);
            var nextExists = !!(d.next && compareDates(d.next.date, currentDate) > -1);
            return prevExists && nextExists;
        }

        function specialCase(sourceStationLabel, targetStationLabel) {
            return sourceStationLabel.indexOf('*') !== -1 || targetStationLabel.indexOf('*') !== -1
        }

        var getTrueBB = function (e) {
            var bb = e.getBBox();
            var x = bb.x + map.latLngToLayerPoint(e.__data__.LatLng).x;
            var y = bb.y + map.latLngToLayerPoint(e.__data__.LatLng).y;
            return {
                minX: x + 1,
                minY: y + 3,
                maxX: x + bb.width,
                maxY: y + bb.height - 3
            }
        };

        //------------------------------------------------------

        map = L.map('map', {zoomControl: false, keyboard: false}).setView(mapSettings.mapCenter, mapSettings.zoom);
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', mapSettings.leafletZoom).addTo(map);
        L.control.zoom({position: 'topright'}).addTo(map);
        L.svg().addTo(map);

        var g = d3.select('#map').select('svg').select('g').attr('class', 'leaflet-zoom-hide');

        var controlsWidth = undefined;

        if (visualConfig.layout === 'portrait') {
            controlsWidth = Math.min(window.innerWidth * 0.8, 400);
        } else {
            if (visualConfig.mobile) {
                controlsWidth = window.innerWidth * 0.40;
            } else {
                controlsWidth = Math.min(window.innerWidth * 0.25, 400);
            }
        }

        var controlsHeight = 0.8 * controlsWidth;

        var controlsSvg = d3
            .select('.controls-timeline')
            .attr('width', controlsWidth)
            .attr('height', controlsHeight);

        if (visualConfig.layout === 'portrait') {
            var bottom = 0;
            if (window.innerHeight > 1200) {
                bottom = window.innerHeight * 0.05;
            }
            controlsSvg
                .style('bottom', bottom)
                .style('right', (window.innerWidth - controlsWidth) * 0.5);

            var topControlsSide = map.containerPointToLatLng(L.point(0, window.innerHeight - bottom - controlsHeight + controlsWidth / 4));
            var bottomScreenSide = map.containerPointToLatLng(L.point(0, window.innerHeight));
            map.panTo([mapSettings.mapCenter[0] - 0.5 * (topControlsSide.lat - bottomScreenSide.lat), mapSettings.mapCenter[1]], {animate: false});
        } else {
            var rightPadding = window.innerWidth * 0.05;
            if (visualConfig.mobile) {
                rightPadding = 0;
            }

            controlsSvg
                .style('bottom', (window.innerHeight - controlsHeight) * 0.5)
                .style('right', rightPadding);

            var leftControlsSide = map.containerPointToLatLng(L.point(window.innerWidth - rightPadding - controlsWidth, 0));
            var rightScreenSide = map.containerPointToLatLng(L.point(window.innerWidth, 0));
            map.panTo([mapSettings.mapCenter[0], mapSettings.mapCenter[1] - 0.5 * (leftControlsSide.lng - rightScreenSide.lng)], {animate: false});
        }


        //--------------------------------------------------------


        var lineSpace = (controlsHeight - 3 * visualConfig.controlsTopMargin) / 4;

        var axisGroup = controlsSvg
            .append('g')
            .attr('transform', 'translate(' + visualConfig.controlsLeftMargin + ',' + (visualConfig.controlsTopMargin + 3 * lineSpace) + ')');

        function createLineLabel() {
            var lineLabelGroup = controlsSvg
                .append('g')
                .attr('class', 'label-line')
                .attr('opacity', 0);
            lineLabelGroup
                .append('circle')
                .attr('class', 'label-line-color')
                .attr('r', 15);
            lineLabelGroup
                .append('text')
                .attr('class', 'label-line-number')
                .attr('dx', 0).attr('dy', 0)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'central');
            lineLabelGroup
                .append('text')
                .attr('class', 'label-line-text')
                .attr('dx', 20)
                .attr('dy', 0)
                .attr('dominant-baseline', 'central');
        }

        function createButtons() {
            var buttonsGroup = controlsSvg.append('g');
            var buttonsData = [
                ['prevevent', 'событие', '\uf13a'],
                ['nextevent', 'событие', '\uf139'],
                ['prevyear', 'квартал', '\uf137'],
                ['nextyear', 'квартал', '\uf138'],
                ['animate', 'авто', '\uf144'],
                ['labelsswitch', 'подписи', '\uf06e']
            ];

            var cw = controlsWidth - 2 * visualConfig.controlsLeftMargin;
            var gap = 0.2 * cw / buttonsData.length;
            var buttonWidth = 0.8 * cw / buttonsData.length;
            var textEm = buttonWidth / 80 + 'em';
            var iconEm = buttonWidth / 50 + 'em';
            visualConfig.globalEm = textEm;

            function addButton(id, x, y, text, symbol) {
                var buttG = buttonsGroup.append('g').attr('id', id).attr('class', 'control-group').attr('transform', 'translate(' + x + ',' + y + ')');
                buttG.append('rect')
                    .attr('class', 'control-button')
                    .attr('x', 0)
                    .attr('y', 0)
                    .attr('width', buttonWidth)
                    .attr('height', buttonWidth)
                    .attr('rx', buttonWidth / 8)
                    .attr('ry', buttonWidth / 8);
                buttG.append('text')
                    .attr('dy', 0.8 * buttonWidth)
                    .attr('dx', buttonWidth / 2)
                    .style('font-size', textEm)
                    .text(text);
                buttG.append('text')
                    .attr('dy', buttonWidth / 2)
                    .attr('dx', buttonWidth / 2)
                    .attr('font-family', 'FontAwesome')
                    .style('font-size', iconEm)
                    .text(symbol);
            }

            var bw = buttonsData.length * buttonWidth + (buttonsData.length - 1) * gap;
            var ddx = (cw - bw) / 2;
            for (var i = 0; i < buttonsData.length; i++) {
                var b = buttonsData[i];
                var dx = i * (buttonWidth + gap);
                addButton(b[0], ddx + dx, 0, b[1], b[2]);
            }
            buttonsGroup.attr('transform', 'translate(' + visualConfig.controlsLeftMargin + ',' + (visualConfig.controlsTopMargin + 4 * lineSpace) + ')')
        }

        function createLogo() {
            if (visualConfig.mobile || (visualConfig.layout === 'portrait' && window.innerHeight > 900)) {
                return;
            }
            var width = controlsWidth / 4;
            var logo = d3.select('#logo');
            controlsSvg
                .append('image')
                .attr('class', 'controls-logo')
                .attr('href', 'assets/logo2.png')
                .attr('x', -width / 2)
                .attr('y', 0)
                .attr('width', width)
                .attr('height', width)
                .attr('transform', 'translate(' + controlsWidth / 2 + ',0)')
                .on('click', function () {
                    controlsSvg.style('opacity', 0);
                    logo.style('visibility', 'visible');
                });

            d3.select('#logo')
                .attr('width', width)
                .attr('height', width).on('click', function () {
                controlsSvg.style('opacity', 1);
                logo.style('visibility', 'hidden');
            })


        }

        createLogo();
        createLineLabel();
        createButtons();


        function getMeaningfulDates(stationsData, updatesData, transfersData) {
            var meaningfulDates = [];
            _.each(stationsData, function (d) {
                var actualLine = d.line;
                var lineUpdates = _.filter(updatesData, {'name_en': d.name_en, 'opened': d.opened, type: 'line'});
                lineUpdates.forEach(function (update) {
                    if (+update.from <= +d.date && +d.date <= +update.to) {
                        actualLine = update.value;
                    }
                });

                meaningfulDates.push([d.date, actualLine, 'opened']);
            });
            _.each(updatesData, function (actualUpdate) {
                var station = findStation(actualUpdate.name_en, actualUpdate.opened);
                var actualLineFrom = station.line;
                var actualLineTo = station.line;

                var lineUpdates = _.filter(updatesData, {
                    'name_en': station.name_en,
                    'opened': station.opened,
                    type: 'line'
                });
                lineUpdates.forEach(function (lineUpdate) {
                    if (+lineUpdate.from <= +actualUpdate.from && +actualUpdate.from <= +lineUpdate.to) {
                        meaningfulDates.push([actualUpdate.from, lineUpdate.value, actualUpdate.type]);
                        actualLineFrom = lineUpdate.value;
                    }
                    if (+lineUpdate.from <= +actualUpdate.to && +actualUpdate.to <= +lineUpdate.to) {
                        meaningfulDates.push([actualUpdate.to, lineUpdate.value, actualUpdate.type]);
                        actualLineTo = lineUpdate.value;
                    }
                });

                if (actualLineFrom === station.line) {
                    meaningfulDates.push([actualUpdate.from, station.line, actualUpdate.type]);
                }
                if (actualLineTo === station.line && actualUpdate.name_en !== 'PervomayskayaClosed') {
                    meaningfulDates.push([actualUpdate.to, station.line, actualUpdate.type]);
                }

            });
            _.each(transfersData, function (transferUpdate) {
                if (transferUpdate.from !== null){
                    meaningfulDates.push([d3.timeMonth.floor(dateParse(transferUpdate.from)), null, 'opened']);
                }
            });
            meaningfulDates = _.uniqBy(meaningfulDates, function (d) {
                return +d[0] + d[1] + d[2];
            });
            return _.sortBy(meaningfulDates, function (d) {
                return d[0]
            });
        }

        var debugFunctions = {
            showLabelBoxes: function (items) {
                g.selectAll('.debugbbox').remove();
                g.selectAll('.debugbbox')
                    .data(items)
                    .enter()
                    .append('rect')
                    .attr('class', 'debugbbox')
                    .attr('x', function (d) {
                        return d.minX
                    })
                    .attr('y', function (d) {
                        return d.minY
                    })
                    .attr('width', function (d) {
                        return d.maxX - d.minX
                    })
                    .attr('height', function (d) {
                        return d.maxY - d.minY
                    })
            },
            addGeoJSON: function () {
                d3.json('dataset/lines.geojson', function (geojson) {
                    L.geoJSON(geojson, {
                        'color': '#777',
                        'weight': 2,
                        'dashArray': '5, 5',
                        'opacity': 0.35
                    }).addTo(map);
                })
            }
        };


        var labelData = {};
        var tree = rbush();
        var selectedLineNumber = undefined;

        function setLineLabel(lineNumber, turnOn) {
            var g = d3.select('.label-line');
            if (!turnOn && selectedLineNumber === undefined) {
                g.attr('opacity', 0)
                    .on('click', undefined)
                    .style('pointer-events', 'none');
                return;
            }
            if (selectedLineNumber === undefined && turnOn) {
                g.select('.label-line-color').style('fill', lineInfo[lineNumber][0]);
                g.select('.label-line-number').text(lineNumber);
                g.select('.label-line-text').text(lineInfo[lineNumber][1]);

                var cw = controlsSvg.node().getBoundingClientRect().width - visualConfig.controlsLeftMargin;
                var cw2 = g.node().getBoundingClientRect().width;
                var dx = (cw - cw2) / 2;
                g.attr('transform', 'translate(' + (visualConfig.controlsLeftMargin + dx) + ',' + (visualConfig.controlsTopMargin + lineSpace + 10) + ')')
                    .attr('opacity', 1)
                    .style('pointer-events', 'all')
                    .on('click', function (d) {
                        selectedLineNumber = undefined;
                        link.classed('hidden-label', false);
                        station.classed('hidden-label', false);
                        setLineLabel('', false);
                        updateTimeline();
                        update(false);
                    })
            }
        }

        function generateLinksData() {
            var links = [];
            _.each(transfersData, function (d) {
                var s1 = findStation(d.from_name, d.from_opened);
                var s2 = findStation(d.to_name, d.to_opened);
                links.push({source: s1, target: s2, from: d.from ? d3.timeMonth.floor(dateParse(d.from)) : null, transfer: true, c: [s1.LatLng, s2.LatLng]});
            });

            var idToStation = _.keyBy(stationsData, 'id');
            processedLines.lines.forEach(function (l) {
                var s1 = idToStation[l.from];
                var s2 = idToStation[l.to];
                s1.next = s2;
                s2.prev = s1;

                links.push({
                    source: s1,
                    target: s2,
                    c: _.map(l.c, function (d) {
                        return new L.LatLng(d[1], d[0])
                    })
                })
            });
            return links;
        }

        var timeExtent = d3.extent(stationsData, function (d) {
            return d.date
        });
        var timeScale = d3.scaleTime()
            .domain(timeExtent)
            .range([0, controlsSvg.node().getBoundingClientRect().width - 2 * visualConfig.controlsLeftMargin]);

        var xAxis = d3.axisBottom()
            .scale(timeScale)
            .tickSize(10, 0);
        axisGroup.call(xAxis);

        var strokeWidthScale = d3.scaleLinear().domain([mapSettings.leafletZoom.minZoom, mapSettings.leafletZoom.maxZoom]).range([2.6, 5]);

        // var strokeWidthScale = d3.scaleLinear().domain([mapSettings.leafletZoom.minZoom, mapSettings.leafletZoom.maxZoom]).range([2, 6]);

        function getStroke() {
            return strokeWidthScale(map.getZoom());
        }

        var interpolateTypes = [d3.curveLinear, d3.curveBasis, d3.curveBundle, d3.curveCardinal, d3.curveNatural];
        var interpolateType = 1;
        var lineFunction = d3.line()
            .x(function (d) {
                return d.x;
            })
            .y(function (d) {
                return d.y;
            })
            .curve(interpolateTypes[interpolateType]);


        var link = g.selectAll('.line')
            .data(generateLinksData())
            .enter().append('path')
            .attr('class', 'line')
            .on('click', selectLine)
            .on('mouseover', highlightLine)
            .on('mouseout', dehighlightLine);

        var linkSelect = g.selectAll('.line-select')
            .data(generateLinksData())
            .enter().append('path')
            .attr('class', 'line-select')
            .on('click', selectLine)
            .on('mouseover', highlightLine)
            .on('mouseout', dehighlightLine);

        var station = g.selectAll('.station')
            .data(stationsData)
            .enter().append('g').attr('class', 'station');

        var stationMarker = station
            .append('circle')
            .attr('class', 'station-marker');

        var stationLabel = station
            .append('text')
            .attr('class', 'station-label')
            .attr('text-anchor', function (d) {
                return d.invert_label ? 'end' : 'start'
            });

        var timeLabelMonth = controlsSvg
            .append('text')
            .attr('class', 'controls-date')
            .attr('dominant-baseline', 'central')
            .attr('text-anchor', 'middle')
            .attr('x', controlsWidth * 0.5)
            .attr('y', visualConfig.controlsTopMargin + 2 * lineSpace - controlsWidth * 0.032)
            .attr('font-size', controlsWidth * 0.06);
        var timeLabelYear = controlsSvg
            .append('text')
            .attr('class', 'controls-date')
            .attr('dominant-baseline', 'central')
            .attr('text-anchor', 'middle')
            .attr('x', controlsWidth * 0.5)
            .attr('y', visualConfig.controlsTopMargin + 2 * lineSpace + controlsWidth * 0.032)
            .attr('font-size', controlsWidth * 0.06);

        function dragged() {
            var range = timeScale.range();

            var eventX = d3.event.x;
            if (eventX < range[0]) {
                eventX = range[0];
            } else if (eventX > range[1]) {
                eventX = range[1];
            }

            var newTime = timeScale.invert(eventX);
            if (compareDates(timeControls.getTime(), newTime) !== 0) {
                timeControls.setTime(newTime);
                update(false);
            }
        }

        var timeMark = axisGroup.append('g').call(d3.drag().on('drag', dragged));
        timeMark.append('circle')
            .attr('class', 'time-mark-back')
            .attr('cx', 0)
            .attr('r', 10);
        timeMark.append('text')
            .attr('class', 'time-mark-text')
            .text('\uf192');

        var timeControls = {
            intervalCounter: 0,
            timeInterval: d3.timeMonth.range(timeExtent[0], d3.timeMonth.offset(timeExtent[1], 1)),
            meaningfulDates: getMeaningfulDates(stationsData, updatesData, transfersData),
            setTime: function (date) {
                this.intervalCounter = _.findIndex(this.timeInterval, function (intervalDate) {
                    return compareDates(intervalDate, date) === 0;
                });
            },
            changeInterval: function (step) {
                this.intervalCounter += step;
                var counterStart = 0;
                var counterEnd = this.timeInterval.length - 1;

                if (selectedLineNumber) {
                    var domain = getTimelineDomain(selectedLineNumber);
                    counterStart = _.findIndex(this.timeInterval, function (dd) {
                        return +dd === +domain[0]
                    });
                    counterEnd = _.findIndex(this.timeInterval, function (dd) {
                        return +dd === +domain[1]
                    });
                }

                if (this.intervalCounter > counterEnd) {
                    this.intervalCounter = counterStart;
                    station.style('opacity', 0);
                }

                if (this.intervalCounter < counterStart) {
                    this.intervalCounter = counterEnd;
                }
            },
            nextEvent: function (step) {
                var currentTime = +this.getTime();
                var newTime = undefined;

                var interestingEvents = _.filter(this.meaningfulDates, function (date) {
                    var matchByLine = selectedLineNumber ? selectedLineNumber === date[1] : true;
                    var ignoreNamesIfNoLabels = !visualConfig.showLabels ? date[2] !== 'name' : true;
                    return matchByLine && ignoreNamesIfNoLabels;
                });
                var eventBefore = -1;
                var eventAfter = -1;
                for (var t = 0; t < interestingEvents.length; t++) {
                    var e = interestingEvents[t];
                    if (+e[0] < currentTime) eventBefore = t;
                    if (+e[0] > currentTime) {
                        eventAfter = t;
                        break;
                    }
                }
                if (step > 0) {
                    if (eventAfter === -1) {
                        newTime = interestingEvents[0][0];
                    } else {
                        newTime = interestingEvents[eventAfter][0];
                    }
                } else {
                    if (eventBefore === -1) {
                        newTime = interestingEvents[interestingEvents.length - 1][0];
                    } else {
                        newTime = interestingEvents[eventBefore][0];
                    }
                }

                function bi(array, i, j, val) {
                    if (i > j) {
                        return -1;
                    }
                    var k = Math.floor((i + j) / 2);
                    var midval = +array[k];
                    if (midval === val) {
                        return k;
                    }
                    if (midval < val) {
                        return bi(array, k + 1, j, val);
                    } else {
                        return bi(array, i, k - 1, val);
                    }
                }

                this.intervalCounter = bi(this.timeInterval, 0, this.timeInterval.length - 1, +newTime);
            },
            getTime: function () {
                return this.timeInterval[this.intervalCounter];
            }
        };

        var animationControls = {
            animate: false,
            timer: undefined,
            toggleAnimation: function () {
                this.animate = !this.animate;
                this.run()
            },
            stopAnimation: function () {
                if (this.animate) {
                    this.animate = false;
                    this.run();
                }
            },
            run: function () {
                if (this.animate) {
                    timeControls.nextEvent(1);
                    update(false);
                    this.timer = d3.interval(function () {
                        timeControls.nextEvent(1);
                        update(false);
                    }, 500);
                    d3.select('#animate').select('text + text').text('\uf28d');
                    d3.select('#animate').select('rect').style('fill', 'red');
                } else {
                    if (this.timer) {
                        this.timer.stop();
                    }
                    d3.select('#animate').select('text + text').text('\uf144');
                    d3.select('#animate').select('rect').style('fill', null);
                }
            }
        };
        d3.select('#animate').on('click', function (d, i) {
            animationControls.toggleAnimation();
        });
        d3.select('#labelsswitch').on('click', function (d, i) {
            visualConfig.showLabels = !visualConfig.showLabels;
            stationLabel.classed('hidden-label', !visualConfig.showLabels);

            if (visualConfig.showLabels) {
                d3.select(this).select('text + text').text('\uf06e');
            } else {
                d3.select(this).select('text + text').text('\uf070');
            }

            update(false);
        });

        update(true);

        map.on('zoomend', function () {
            update(true);
        });

        function getTimelineDomain(line) {
            var lineDomain = d3.extent(timeControls.meaningfulDates.filter(function (dd) {
                return dd[1] === selectedLineNumber
            }), function (dd) {
                return dd[0]
            });
            var fullDomain = d3.extent(timeControls.meaningfulDates, function (dd) {
                return dd[0]
            });
            if (line !== undefined) {
                return [new Date(lineDomain[0]), new Date(fullDomain[1])];
            } else {
                return [new Date(fullDomain[0]), new Date(fullDomain[1])];
            }
        }

        function updateTimeline() {
            var domain = getTimelineDomain(selectedLineNumber);
            timeScale.domain(domain);
            if (timeControls.getTime() > domain[1]) {
                timeControls.setTime(domain[1]);
            }

            axisGroup.call(xAxis);
            timeMark.raise();
        }

        function selectLine(d) {

            if (!selectedLineNumber) {
                var vis = d.target.present && d.source.present && (d.target.currentLine === d.source.currentLine || specialCase(d.target.currentLine, d.source.currentLine));
                if (d.transfer || !vis) {
                    return;
                }
                selectedLineNumber = d.source.currentLine;
                updateTimeline();
                update(false);
            } else {
                selectedLineNumber = undefined;
                link.classed('hidden-label', false);
                station.classed('hidden-label', false);
                updateTimeline();
                update(false);
            }
        }

        function highlightLine(d) {
            if (!(d.target.present && d.source.present) || d.transfer) {
                return;
            }
            map.doubleClickZoom.disable();
            var l = d.source.currentLine;
            link.filter(function (dd) {
                return (dd.source.currentLine === l || dd.target.currentLine === l) && !dd.transfer;
            }).style('stroke-width', getStroke() * 1.5);
            setLineLabel(l, true);
        }

        function dehighlightLine(d) {
            map.doubleClickZoom.enable();
            var l = d.source.currentLine;
            link.filter(function (dd) {
                return (dd.source.currentLine === l || dd.target.currentLine === l) && !dd.transfer;
            }).style('stroke-width', getStroke());
            setLineLabel(l, false);
        }

        // var t0 = performance.now();
        // for (var u = 0; u < 400; u++) {
        //     update(false);
        //     // timeControls.nextEvent1(1);
        //     // timeControls.nextEvent(1);
        // }
        // var t1 = performance.now();
        // alert(t1 - t0);

        function update(updateElementsLayout) {
            var currentDate = timeControls.getTime();

            timeMark.attr('transform', 'translate(' + timeScale(currentDate) + ',0)');
            timeLabelMonth.text(dateToString(currentDate)[0]);
            timeLabelYear.text(dateToString(currentDate)[1]);

            stationsData.forEach(function (stationRecord) {
                stationRecord.visible = compareDates(stationRecord.date, currentDate) > -1;
                stationRecord.present = stationRecord.visible || neighborCheck(stationRecord, currentDate);
                stationRecord.currentLine = stationRecord.line;
                stationRecord.current_name = stationRecord.name_ru;

                stationRecord.updates.forEach(function (update) {
                    if (compareDates(update.from, currentDate) > -1 && compareDates(currentDate, update.to) === 1) {
                        switch (update.type) {
                            case 'line':
                                stationRecord.currentLine = update.value;
                                break;
                            case 'visible':
                                stationRecord.present = (update.value === 'true');
                                stationRecord.visible = (update.value === 'true');
                                break;
                            case 'present':
                                stationRecord.present = (update.value === 'true');
                                stationRecord.visible = false;
                                break;
                            case 'name':
                                stationRecord.current_name = update.value;
                        }
                    }
                });
            });

            if (updateElementsLayout) {
                station.attr('transform',
                    function (d) {
                        return 'translate(' +
                            map.latLngToLayerPoint(d.LatLng).x + ',' +
                            map.latLngToLayerPoint(d.LatLng).y + ')';
                    }
                );
                stationMarker
                    .style('stroke-width', getStroke() * 0.66)
                    .attr('r', 1 * getStroke());

                link
                    .attr('d', function (d) {
                        var xyFromLatLon = _.map(d.c, function (point_coordinates) {
                            return map.latLngToLayerPoint(point_coordinates)
                        });

                        xyFromLatLon = simplify(xyFromLatLon, visualConfig.tolerance, true);
                        return lineFunction(xyFromLatLon);
                    })
                    .style('stroke-width', function (d) {
                        return d.transfer ? 4 * getStroke() : getStroke();
                    });

                linkSelect
                    .attr('d', function (d) {
                        var xyFromLatLon = _.map(d.c, function (point_coordinates) {
                            return map.latLngToLayerPoint(point_coordinates)
                        });

                        xyFromLatLon = simplify(xyFromLatLon, visualConfig.tolerance, true);
                        return lineFunction(xyFromLatLon);
                    })
                    .style('stroke-width', 4 * getStroke());
            }

            link
                .style('stroke', function (d) {
                    if (d.transfer) {
                        return lineInfo.transfer[0]
                    }
                    return lineInfo[d.source.currentLine][0]
                })
                .style('stroke-opacity', function (d) {
                    var vis = false;
                    if (d.transfer) {
                        vis = d.target.visible && d.source.visible && (d.from === null || compareDates(d.from, currentDate) > -1);
                    } else {
                        vis = d.target.present && d.source.present && (d.target.currentLine === d.source.currentLine || specialCase(d.target.currentLine, d.source.currentLine));
                    }
                    return vis ? visualConfig.linkOpacity : 0
                })
                .classed('transferline', function (d) {
                    return d.transfer;
                });

            linkSelect.style('pointer-events', function (d) {
                var vis = false;
                if (d.transfer) {
                    vis = d.target.visible && d.source.visible;
                } else {
                    vis = d.target.present && d.source.present && (d.target.currentLine === d.source.currentLine || specialCase(d.target.currentLine, d.source.currentLine));
                }
                return vis ? 'all' : 'none'
            });

            station
                .style('stroke', function (d) {
                    return lineInfo[d.currentLine][0]
                })
                .style('opacity', function (d) {
                    return d.visible ? 1.0 : 0
                });

            stationLabel
                .text(function (d) {
                    return d.current_name;
                })
                .attr('dx', function (d) {
                    return d.invert_label ? -1.8 * getStroke() : 1.8 * getStroke()
                })
                .style('font-size', 3 * getStroke());//originally: 9


            // -----------------------------------------------------------------------------------------

            if (updateElementsLayout) {
                labelData = {};
                tree.clear();
                var items = [];
                stationLabel.each(function (d) {
                    var boundingBox = getTrueBB(this);
                    boundingBox.node = d;
                    items.push(boundingBox);
                });
                tree.load(items);
                stationLabel.each(function (d) {
                    var intersects = tree.search(getTrueBB(this));
                    if (intersects.length > 1) {
                        labelData[d.id] = _.filter(intersects, function (boundingBox) {
                            var notTheSameLabel = boundingBox.node.id !== d.id;
                            var dontShareName = sharedNames.indexOf(boundingBox.node.name_en) === -1;
                            return notTheSameLabel && dontShareName;
                        });
                    }
                });
                // debugFunctions.showLabelBoxes(items);
            }

            stationLabel.style('opacity', 1.0);
            var debugHiddenLabels = 0;
            stationLabel.each(function (d) {
                if (d.visible) {
                    var intersections = _.filter(labelData[d.id], function (dd) {
                        return dd.node.visible;
                    });
                    if (intersections && intersections.length > 0) {
                        debugHiddenLabels += 1;
                        d3.select(this).style('opacity', 0.4 / intersections.length);
                        // d3.select(d).style('opacity', 0.2);
                    }
                }
            });
            // d3.select('.info').html(debugHiddenLabels);

            sharedNames.forEach(function (stationNameEn) {
                var labelCollisionNodes = _.filter(stationLabel.nodes(), function (labelNode) {
                    return labelNode && labelNode.__data__.name_en === stationNameEn && labelNode.__data__.visible;
                });
                labelCollisionNodes = _.sortBy(labelCollisionNodes, function(d){
                    return -d.__data__.LatLng.lat;
                });
                if (labelCollisionNodes && labelCollisionNodes.length > 1) {
                    var initOpacity = d3.select(labelCollisionNodes[0]).style('opacity');

                    var coordinates = _.map(labelCollisionNodes, function (labelNode) {
                        d3.select(labelNode).style('opacity', 0);
                        return map.latLngToLayerPoint(labelNode.__data__.LatLng);
                    });
                    var dx = _.sumBy(coordinates, 'x') / coordinates.length - coordinates[0].x;
                    var dy = _.sumBy(coordinates, 'y') / coordinates.length - coordinates[0].y;
                    var sign = Math.pow(-1, +labelCollisionNodes[0].__data__.invert_label);

                    d3.select(labelCollisionNodes[0])
                        .style('opacity', initOpacity)
                        .attr('transform', 'translate(' + dx + ',' + dy + ')');
                }
                if (labelCollisionNodes.length === 1) {
                    d3.select(labelCollisionNodes[0]).attr('transform', 'translate(0, 0)'); // no collision, reset to default
                }
            });

            if (selectedLineNumber) {
                link.classed('hidden-label', function (d) {
                    return (d.source.currentLine !== selectedLineNumber && d.target.currentLine !== selectedLineNumber) || d.transfer;
                });
                station.classed('hidden-label', function (d) {
                    return d.currentLine !== selectedLineNumber;
                });
                station
                    .filter(function (d) {
                        return d.currentLine === selectedLineNumber;
                    })
                    .select('text')
                    .style('opacity', 1)
                    .attr('transform', 'translate(0,0)');
            }

            //-----------------------------------------------------------------------------------------------
        }


        // Controls section -----------------------------------------------------------------------------------------------

        d3.select('#nextyear').on('click', function () {
            animationControls.stopAnimation();
            timeControls.changeInterval(3);
            update(false);
        });
        d3.select('#prevyear').on('click', function () {
            animationControls.stopAnimation();
            timeControls.changeInterval(-3);
            update(false);
        });
        d3.select('#prevevent').on('click', function () {
            animationControls.stopAnimation();
            timeControls.nextEvent(-1);
            update(false);
        });
        d3.select('#nextevent').on('click', function () {
            animationControls.stopAnimation();
            timeControls.nextEvent(1);
            update(false);
        });
        d3.select('#hidelabels').on('change', function () {
            stationLabel.classed('hidden-label', d3.select('#hidelabels').property('checked'));
        });
        document.addEventListener('keydown', function (event) {

            if (event.keyCode === 32) {
                animationControls.toggleAnimation();
            }
            if (event.code === 'Escape') {
                if (selectedLineNumber) {
                    selectLine(undefined);
                    setLineLabel(undefined, false);
                }
            }
            if (event.code === 'Comma') {
                visualConfig.tolerance -= 0.1;
                if (visualConfig.tolerance < 0.0) {
                    visualConfig.tolerance = 0.0;
                }
                update(true);
            }
            if (event.code === 'Period') {
                visualConfig.tolerance += 0.1;
                update(true);
            }
            if (event.code === 'ArrowLeft') {
                animationControls.stopAnimation();
                timeControls.changeInterval(-3);
                update(false);
            }
            if (event.code === 'ArrowRight') {
                animationControls.stopAnimation();
                timeControls.changeInterval(3);
                update(false);
            }
            if (event.code === 'ArrowUp') {
                animationControls.stopAnimation();
                timeControls.nextEvent(1);
                update(false);
            }
            if (event.code === 'ArrowDown') {
                animationControls.stopAnimation();
                timeControls.nextEvent(-1);
                update(false);
            }
        });
        // </Controls section> ---------------------------------------------------------------------------------------------
    }
})();
